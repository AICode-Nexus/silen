import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import react from '@vitejs/plugin-react'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import type { RenderedPage } from '../client/app.js'
import type { ResolvedConfig } from '../shared/config.js'
import type { SilenPageData } from '../shared/plugin.js'
import { resolveConfig } from './config.js'
import { createMdxPlugins } from './mdx.js'
import { silenPlugin } from './plugin.js'
import { pluginRunnerFor, type PluginRunner } from './plugins.js'
import { scanRoutes } from './routes.js'
import { renderDocument } from './render.js'
import {
  defaultFavicon,
  defaultFaviconSvg,
  resolveSourceFavicon,
  type ResolvedFavicon,
} from './favicon.js'

export interface ServerOptions {
  host?: boolean | string
  port?: number | string
}

export interface SilenServer {
  host: string
  port: number
  url: string
  close: () => Promise<void>
}

interface RendererModule {
  render: (url: string) => Promise<RenderedPage>
}

interface ResolvedListenOptions {
  host: string
  port: number
}

interface ParsedRequestPath {
  pathname: string
}

const mimeTypes: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolvePort(value: ServerOptions['port'], fallback: number): number {
  if (value === undefined) return fallback
  if (
    typeof value === 'string' &&
    (value.length === 0 || !/^\d+$/.test(value))
  ) {
    throw new TypeError(
      `Invalid port ${JSON.stringify(value)}: expected 0-65535`,
    )
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError('Invalid port: expected a number')
  }

  const port = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError(`Invalid port ${String(value)}: expected 0-65535`)
  }
  return port
}

function resolveHost(value: ServerOptions['host']): string {
  if (value === undefined || value === false) return '127.0.0.1'
  if (value === true) return '0.0.0.0'
  const host = value.trim()
  if (host.length === 0)
    throw new TypeError('Invalid host: expected a hostname')
  return host
}

function listenOptions(
  options: ServerOptions,
  defaultPort: number,
): ResolvedListenOptions {
  return {
    host: resolveHost(options.host),
    port: resolvePort(options.port, defaultPort),
  }
}

function parseRequestPath(
  url: string | undefined,
): ParsedRequestPath | undefined {
  if (!url) return undefined
  const rawPathname = url.split('?', 1)[0]
  if (!rawPathname?.startsWith('/') || rawPathname.startsWith('//')) {
    return undefined
  }

  for (const rawSegment of rawPathname.split('/')) {
    let segment: string
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      return undefined
    }
    if (
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0')
    ) {
      return undefined
    }
  }

  let pathname: string
  try {
    pathname = new URL(url, 'http://silen.local').pathname
  } catch {
    return undefined
  }
  return { pathname }
}

function pathWithinBase(pathname: string, base: string): boolean {
  if (base === '/') return pathname.startsWith('/')
  return pathname.startsWith(base)
}

function baseRedirect(pathname: string, base: string): boolean {
  return base !== '/' && pathname === base.slice(0, -1)
}

function sendRedirect(
  request: IncomingMessage,
  response: ServerResponse,
  base: string,
): void {
  const query = request.url?.includes('?')
    ? `?${request.url.split('?').slice(1).join('?')}`
    : ''
  response.statusCode = 302
  response.setHeader('location', `${base}${query}`)
  response.end()
}

function sendText(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain; charset=utf-8',
): void {
  const length = Buffer.byteLength(body)
  response.statusCode = status
  response.setHeader('content-type', contentType)
  response.setHeader('content-length', String(length))
  if (request.method === 'HEAD') response.end()
  else response.end(body)
}

function rejectUnsupportedMethod(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return false
  response.setHeader('allow', 'GET, HEAD')
  sendText(request, response, 405, 'Method not allowed\n')
  return true
}

function viteFileUrl(file: string): string {
  return `/@fs${file.replaceAll('\\', '/')}`
}

function clientEntrySource(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      `../client/entry.${sourceExtension ? 'tsx' : 'js'}`,
      import.meta.url,
    ),
  )
}

function ssrEntrySource(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      `../client/ssr-entry.${sourceExtension ? 'tsx' : 'js'}`,
      import.meta.url,
    ),
  )
}

const developmentSsrOutlet = '<!--silen-development-ssr-outlet-->'

async function transformDevelopmentDocument(
  page: RenderedPage,
  vite: ViteDevServer,
  requestUrl: string,
  favicon: ResolvedFavicon,
  head: readonly import('../shared/plugin.js').SilenHeadEntry[] = [],
): Promise<string> {
  const shell = renderDocument(
    { ...page, appHtml: developmentSsrOutlet },
    {
      base: '/',
      clientEntry: viteFileUrl(clientEntrySource()),
      favicon,
      head,
    },
  )
  const transformed = await vite.transformIndexHtml(requestUrl, shell)
  return transformed.replace(developmentSsrOutlet, () => page.appHtml)
}

async function renderDevelopmentRequest(
  request: IncomingMessage,
  response: ServerResponse,
  vite: ViteDevServer,
  config: ResolvedConfig,
  runner: PluginRunner,
  requestUrl: string,
  favicon: ResolvedFavicon,
): Promise<void> {
  try {
    const loaded: unknown = await vite.ssrLoadModule(
      viteFileUrl(ssrEntrySource()),
    )
    const render = (loaded as Partial<RendererModule>).render
    if (typeof render !== 'function') {
      throw new TypeError('the SSR entry does not export render(url)')
    }
    const page = await render(requestUrl)
    let head: readonly import('../shared/plugin.js').SilenHeadEntry[] = []
    if (runner.hasHook('transformHead')) {
      const route = (await scanRoutes(config.root)).find(
        (candidate) => candidate.path === page.publicData.route,
      )
      if (route) {
        const source = await readFile(route.file, 'utf8')
        const pageData: SilenPageData = {
          title: page.title,
          description: page.description,
          frontmatter: page.publicData.frontmatter ?? {},
          headings: page.publicData.headings ?? [],
          links: page.publicData.links ?? [],
          data: page.publicData.data ?? {},
        }
        head = await runner.transformHead(pageData, {
          command: 'serve',
          route: route.path,
          file: route.file,
          source,
        })
      }
    }
    const document = await transformDevelopmentDocument(
      page,
      vite,
      requestUrl,
      favicon,
      head,
    )
    sendText(
      request,
      response,
      page.status,
      document,
      'text/html; charset=utf-8',
    )
  } catch (error) {
    if (error instanceof Error) vite.ssrFixStacktrace(error)
    sendText(
      request,
      response,
      500,
      `Silen development SSR failed: ${errorDetail(error)}\n`,
    )
  }
}

function pathRelativeToBase(pathname: string, base: string): string {
  return base === '/' ? pathname.slice(1) : pathname.slice(base.length)
}

function isDefaultFaviconRequest(
  pathname: string,
  base: string,
  favicon: ResolvedFavicon,
): boolean {
  return (
    favicon.source === 'default' &&
    favicon.file === defaultFavicon.file &&
    pathRelativeToBase(pathname, base) === defaultFavicon.file
  )
}

function sendDefaultFavicon(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const length = Buffer.byteLength(defaultFaviconSvg)
  response.statusCode = 200
  response.setHeader('content-type', defaultFavicon.type)
  response.setHeader('content-length', String(length))
  if (request.method === 'HEAD') response.end()
  else response.end(defaultFaviconSvg)
}

function createDevRequestHandler(
  vite: ViteDevServer,
  config: ResolvedConfig,
  runner: PluginRunner,
  favicon: ResolvedFavicon,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    if (rejectUnsupportedMethod(request, response)) return
    const parsed = parseRequestPath(request.url)
    if (!parsed) {
      sendText(request, response, 404, 'Not found\n')
      return
    }
    if (baseRedirect(parsed.pathname, config.base)) {
      sendRedirect(request, response, config.base)
      return
    }
    if (!pathWithinBase(parsed.pathname, config.base)) {
      sendText(request, response, 404, 'Not found\n')
      return
    }
    if (isDefaultFaviconRequest(parsed.pathname, config.base, favicon)) {
      sendDefaultFavicon(request, response)
      return
    }

    const requestUrl = request.url ?? config.base
    vite.middlewares(request, response, (error: unknown) => {
      if (error) {
        sendText(
          request,
          response,
          500,
          `Silen Vite middleware failed: ${errorDetail(error)}\n`,
        )
        return
      }
      void renderDevelopmentRequest(
        request,
        response,
        vite,
        config,
        runner,
        requestUrl,
        favicon,
      )
    })
  }
}

function containsPath(directory: string, target: string): boolean {
  const relative = path.relative(directory, target)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function previewSegments(pathname: string, base: string): string[] | undefined {
  const relative =
    base === '/' ? pathname.slice(1) : pathname.slice(base.length)
  const rawSegments = relative.split('/')
  if (rawSegments.at(-1) === '') rawSegments.pop()

  const segments: string[] = []
  for (const rawSegment of rawSegments) {
    if (rawSegment.length === 0) return undefined
    let segment: string
    try {
      segment = decodeURIComponent(rawSegment)
    } catch {
      return undefined
    }
    if (
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0') ||
      (segment.startsWith('.') &&
        !(segments.length === 0 && segment === '.well-known'))
    ) {
      return undefined
    }
    segments.push(segment)
  }
  return segments
}

async function safeFile(
  outDir: string,
  candidate: string,
): Promise<{ file: string; size: number } | undefined> {
  try {
    const file = await realpath(candidate)
    if (!containsPath(outDir, file)) return undefined
    const metadata = await stat(file)
    return metadata.isFile() ? { file, size: metadata.size } : undefined
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (
      code === 'ENOENT' ||
      code === 'ENOTDIR' ||
      code === 'EACCES' ||
      code === 'ELOOP'
    ) {
      return undefined
    }
    throw error
  }
}

async function findPreviewFile(
  outDir: string,
  segments: readonly string[],
): Promise<{ file: string; size: number } | undefined> {
  const exact = path.resolve(outDir, ...segments)
  if (!containsPath(outDir, exact)) return undefined
  const candidates =
    segments.length === 0
      ? [path.join(outDir, 'index.html')]
      : [exact, path.join(exact, 'index.html')]

  for (const candidate of candidates) {
    const file = await safeFile(outDir, candidate)
    if (file) return file
  }
  return undefined
}

async function servePreviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
  outDir: string,
  base: string,
): Promise<void> {
  if (rejectUnsupportedMethod(request, response)) return
  const parsed = parseRequestPath(request.url)
  if (!parsed) {
    sendText(request, response, 404, 'Not found\n')
    return
  }
  if (baseRedirect(parsed.pathname, base)) {
    sendRedirect(request, response, base)
    return
  }
  if (!pathWithinBase(parsed.pathname, base)) {
    sendText(request, response, 404, 'Not found\n')
    return
  }
  const segments = previewSegments(parsed.pathname, base)
  if (!segments) {
    sendText(request, response, 404, 'Not found\n')
    return
  }

  try {
    const found = await findPreviewFile(outDir, segments)
    if (!found) {
      sendText(request, response, 404, 'Not found\n')
      return
    }
    response.statusCode = 200
    response.setHeader(
      'content-type',
      mimeTypes[path.extname(found.file).toLowerCase()] ??
        'application/octet-stream',
    )
    response.setHeader('content-length', String(found.size))
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    await pipeline(createReadStream(found.file), response)
  } catch (error) {
    if (!response.headersSent) {
      sendText(
        request,
        response,
        500,
        `Silen preview failed: ${errorDetail(error)}\n`,
      )
    } else {
      response.destroy(error as Error)
    }
  }
}

async function listen(
  server: HttpServer,
  options: ResolvedListenOptions,
): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(options.port, options.host)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Silen server did not resolve a TCP address')
  }
  return address
}

function displayHostname(address: AddressInfo): string {
  if (address.address === '0.0.0.0') return '127.0.0.1'
  if (address.address === '::') return '[::1]'
  return address.family === 'IPv6' ? `[${address.address}]` : address.address
}

function serverLifecycle(
  server: HttpServer,
  address: AddressInfo,
  host: string,
  base: string,
  closeAdditional?: () => Promise<void>,
): SilenServer {
  let closing: Promise<void> | undefined
  const closeHttp = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
      server.closeAllConnections()
    })

  return {
    host,
    port: address.port,
    url: `http://${displayHostname(address)}:${address.port}${base}`,
    close: () => {
      closing ??= Promise.all([closeHttp(), closeAdditional?.()]).then(
        () => undefined,
      )
      return closing
    },
  }
}

export async function createDevServer(
  root: string,
  options: ServerOptions = {},
): Promise<SilenServer> {
  const resolvedListen = listenOptions(options, 5173)
  const config = await resolveConfig(root, 'serve')
  const runner = pluginRunnerFor(config)
  const favicon = await resolveSourceFavicon(config.root)
  const server = createHttpServer()
  let vite: ViteDevServer | undefined
  try {
    const viteServer = await createViteServer({
      appType: 'custom',
      base: config.base,
      configFile: false,
      optimizeDeps: {
        include: [
          'class-variance-authority',
          'clsx',
          'cmdk',
          'lucide-react',
          'minisearch',
          'radix-ui',
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-runtime',
          'tailwind-merge',
        ],
      },
      plugins: [
        react(),
        ...(await silenPlugin(config, { publicConfigOnly: true, hmr: true })),
        ...(await runner.collectVitePlugins()),
        ...(await createMdxPlugins({ config, runner })),
      ],
      oxc: { jsx: { development: false } },
      resolve: { dedupe: ['react', 'react-dom'] },
      root: config.root,
      ssr: { noExternal: ['@aicode-nexus/silen'] },
      server: {
        middlewareMode: { server },
        ws: { server },
      },
    })
    vite = viteServer
    server.on(
      'request',
      createDevRequestHandler(viteServer, config, runner, favicon),
    )
    const address = await listen(server, resolvedListen)
    return serverLifecycle(
      server,
      address,
      resolvedListen.host,
      config.base,
      () => viteServer.close(),
    )
  } catch (error) {
    await vite?.close()
    throw error
  }
}

export async function createPreviewServer(
  root: string,
  options: ServerOptions = {},
): Promise<SilenServer> {
  const resolvedListen = listenOptions(options, 4173)
  const config = await resolveConfig(root, 'serve')
  let outDir: string
  try {
    outDir = await realpath(config.outDir)
    const metadata = await stat(outDir)
    if (!metadata.isDirectory()) throw new Error('not a directory')
  } catch (error) {
    throw new Error(
      `Cannot preview ${config.outDir}: build output is unavailable (${errorDetail(error)})`,
      { cause: error },
    )
  }

  const server = createHttpServer((request, response) => {
    void servePreviewRequest(request, response, outDir, config.base)
  })
  const address = await listen(server, resolvedListen)
  return serverLifecycle(server, address, resolvedListen.host, config.base)
}
