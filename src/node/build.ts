import { randomUUID } from 'node:crypto'
import {
  mkdir,
  lstat,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import {
  build as viteBuild,
  type Manifest,
  type ManifestChunk,
  type PluginOption,
} from 'vite'
import type { RenderedPage } from '../client/app.js'
import { generateAiArtifacts } from '../ai/artifacts.js'
import { generateSiteContract } from '../ai/contract/site.js'
import type { AiPage } from '../shared/ai.js'
import type { ResolvedConfig } from '../shared/config.js'
import type { RouteRecord } from '../shared/page.js'
import type { SilenPageData } from '../shared/plugin.js'
import { resolveSiteLink } from '../shared/url.js'
import { resolveConfig } from './config.js'
import { ensureBuildFavicon, type ResolvedFavicon } from './favicon.js'
import { validateInternalLinks } from './links.js'
import { serializePageMarkdown } from './markdown-output.js'
import { compilePage, createMdxPlugins, type CompiledPage } from './mdx.js'
import { silenPlugin } from './plugin.js'
import { pluginRunnerFor, type PluginRunner } from './plugins.js'
import { renderDocument, type RenderAssets } from './render.js'
import { scanRoutes } from './routes.js'
import {
  createPageSearchDocuments,
  createSearchIndex,
  serializeSearchIndex,
} from './search.js'
import { createPageSeo, emitSitemap } from './seo.js'

export interface BuildRoute {
  path: string
  file: string
}

export interface BuildResult {
  outDir: string
  routes: BuildRoute[]
}

interface RendererModule {
  render: (url: string) => Promise<RenderedPage>
}

interface PlannedRouteOutput {
  relativeFile: string
  route: RouteRecord
}

interface ErrorWithLocation extends Error {
  id?: unknown
  loc?: { file?: unknown }
}

function normalizedFile(file: string): string {
  return file.replaceAll('\\', '/')
}

function routeContext(route: RouteRecord): string {
  return `route ${route.path} (${route.file})`
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function routesForError(
  error: unknown,
  routes: readonly RouteRecord[],
): readonly RouteRecord[] {
  if (!(error instanceof Error)) return routes
  const located = error as ErrorWithLocation
  const locationFile =
    typeof located.loc?.file === 'string' ? located.loc.file : ''
  const id = typeof located.id === 'string' ? located.id : ''
  const evidence = normalizedFile(
    [error.message, error.stack ?? '', id, locationFile].join('\n'),
  )
  const matching = routes.filter(
    (route) =>
      evidence.includes(normalizedFile(route.file)) ||
      evidence.includes(normalizedFile(route.relativeFile)),
  )
  return matching.length === 0 ? routes : matching
}

function buildError(
  stage: string,
  error: unknown,
  routes: readonly RouteRecord[],
): Error {
  const affected = routesForError(error, routes)
  const context =
    affected.length === 0
      ? 'no discovered static route'
      : affected.map(routeContext).join(', ')
  return new Error(
    `Silen ${stage} failed for ${context}: ${errorDetail(error)}`,
    { cause: error },
  )
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

async function physicalPath(file: string): Promise<string> {
  let existing = path.resolve(file)
  const missingSegments: string[] = []

  for (;;) {
    try {
      return path.resolve(await realpath(existing), ...missingSegments)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error

      const parent = path.dirname(existing)
      if (parent === existing) throw error
      missingSegments.unshift(path.basename(existing))
      existing = parent
    }
  }
}

async function assertSafeOutDir(
  config: ResolvedConfig,
  routes: readonly RouteRecord[],
): Promise<void> {
  const absoluteOutDir = path.resolve(config.outDir)
  const absoluteRoot = path.resolve(config.root)
  const protectedFiles = [
    config.configFile,
    ...routes.map((route) => route.file),
  ]
  const [outDir, root, ...resolvedProtectedFiles] = await Promise.all([
    physicalPath(config.outDir),
    physicalPath(config.root),
    ...protectedFiles.map(physicalPath),
  ])

  if (
    containsPath(absoluteOutDir, absoluteRoot) ||
    containsPath(outDir, root)
  ) {
    throw new Error(
      `Refusing to replace output directory ${config.outDir} because it contains the Silen root ${config.root}`,
    )
  }

  const protectedIndex = resolvedProtectedFiles.findIndex((file, index) => {
    const protectedFile = protectedFiles[index]
    return (
      protectedFile !== undefined &&
      (containsPath(absoluteOutDir, path.resolve(protectedFile)) ||
        containsPath(outDir, file))
    )
  })
  if (protectedIndex !== -1) {
    throw new Error(
      `Refusing to replace output directory ${config.outDir} because it contains protected file ${protectedFiles[protectedIndex]}`,
    )
  }
}

function safeRouteSegments(route: string): string[] {
  if (!route.startsWith('/') || route.includes('\\') || route.includes('\0')) {
    throw new Error(`Unsafe static route ${route}`)
  }
  if (route === '/') return []

  const pathname = route.endsWith('/') ? route.slice(1, -1) : route.slice(1)
  const segments = pathname.split('/')
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Unsafe static route ${route}`)
  }

  for (const segment of segments) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new Error(`Unsafe encoded static route ${route}`)
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('\0')
    ) {
      throw new Error(`Unsafe static route ${route}`)
    }
  }
  return segments
}

export function routeOutputFile(outDir: string, route: string): string {
  const destination = path.resolve(
    outDir,
    ...safeRouteSegments(route),
    'index.html',
  )
  const relative = path.relative(path.resolve(outDir), destination)
  if (
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Static route ${route} escapes output directory ${outDir}`)
  }
  return destination
}

function planRouteOutputs(
  outDir: string,
  routes: readonly RouteRecord[],
): PlannedRouteOutput[] {
  const absoluteOutDir = path.resolve(outDir)
  const seen = new Map<string, PlannedRouteOutput>()

  return routes.map((route) => {
    const destination = routeOutputFile(absoluteOutDir, route.path)
    const key = path.normalize(destination)
    const previous = seen.get(key)
    if (previous) {
      throw new Error(
        `Static output collision at ${destination}: ${routeContext(previous.route)} and ${routeContext(route)} target the same normalized output path`,
      )
    }

    const planned = {
      relativeFile: path.relative(absoluteOutDir, destination),
      route,
    }
    seen.set(key, planned)
    return planned
  })
}

function assertNoReservedContractRoutes(routes: readonly RouteRecord[]): void {
  const collision = routes.find(
    (route) =>
      route.path === '/.well-known/silen' ||
      route.path.startsWith('/.well-known/silen/'),
  )
  if (collision !== undefined) {
    throw new Error(
      `Reserved output collision at .well-known/silen from ${collision.relativeFile}`,
    )
  }
}

async function assertNoReservedContractPublicFiles(
  outDir: string,
): Promise<void> {
  try {
    await lstat(path.join(outDir, '.well-known', 'silen'))
    throw new Error('Reserved output collision at .well-known/silen')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
}

async function removeSourceMapFiles(directory: string): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry)
      const stats = await lstat(file)
      if (stats.isDirectory()) {
        await removeSourceMapFiles(file)
        return
      }
      if (stats.isFile() && entry.endsWith('.map')) {
        await rm(file, { force: true })
      }
    }),
  )
}

async function compilePages(
  routes: readonly RouteRecord[],
  runner: PluginRunner,
): Promise<CompiledPage[]> {
  return Promise.all(
    routes.map(async (route) => {
      try {
        return await compilePage(route, runner)
      } catch (error) {
        throw buildError('page metadata compilation', error, [route])
      }
    }),
  )
}

async function productionPlugins(
  config: ResolvedConfig,
  pages: readonly CompiledPage[],
): Promise<PluginOption[]> {
  const runner = pluginRunnerFor(config)
  return [
    react(),
    ...(await silenPlugin(config, { publicConfigOnly: true })),
    ...(await runner.collectVitePlugins()),
    ...(await createMdxPlugins({ config, runner, pages })),
  ]
}

function entrySource(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      `../client/entry.${sourceExtension ? 'tsx' : 'js'}`,
      import.meta.url,
    ),
  )
}

function ssrSource(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      `../client/ssr-entry.${sourceExtension ? 'tsx' : 'js'}`,
      import.meta.url,
    ),
  )
}

async function buildClient(
  config: ResolvedConfig,
  outDir: string,
  routes: readonly RouteRecord[],
  pages: readonly CompiledPage[],
): Promise<void> {
  try {
    await viteBuild({
      appType: 'custom',
      base: config.base,
      configFile: false,
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      esbuild: { jsxDev: false },
      logLevel: 'silent',
      mode: 'production',
      oxc: { jsx: { development: false } },
      plugins: await productionPlugins(config, pages),
      root: config.root,
      build: {
        assetsInlineLimit: 0,
        emptyOutDir: true,
        manifest: true,
        outDir,
        sourcemap: false,
        rolldownOptions: {
          input: { client: entrySource() },
        },
      },
    })
  } catch (error) {
    throw buildError('client build', error, routes)
  }
}

async function buildServerRenderer(
  config: ResolvedConfig,
  outDir: string,
  routes: readonly RouteRecord[],
  pages: readonly CompiledPage[],
): Promise<string> {
  const output = path.join(outDir, 'ssr-entry.mjs')
  try {
    await viteBuild({
      appType: 'custom',
      base: config.base,
      configFile: false,
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      esbuild: { jsxDev: false },
      logLevel: 'silent',
      mode: 'production',
      oxc: { jsx: { development: false } },
      plugins: await productionPlugins(config, pages),
      root: config.root,
      ssr: { noExternal: ['@aicode-nexus/silen'] },
      build: {
        assetsInlineLimit: 0,
        emptyOutDir: true,
        outDir,
        sourcemap: false,
        ssr: ssrSource(),
        rolldownOptions: {
          output: { entryFileNames: 'ssr-entry.mjs' },
        },
      },
    })
  } catch (error) {
    throw buildError('SSR build', error, routes)
  }
  return output
}

async function readClientManifest(
  outDir: string,
  routes: readonly RouteRecord[],
): Promise<Manifest> {
  const file = path.join(outDir, '.vite/manifest.json')
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('the manifest root is not an object')
    }
    return value as Manifest
  } catch (error) {
    throw buildError('client manifest loading', error, routes)
  }
}

function chunkSourceFile(
  root: string,
  key: string,
  chunk: ManifestChunk,
): string | undefined {
  const source = chunk.src ?? key
  if (!source || source.startsWith('_')) return undefined
  return path.isAbsolute(source) ? source : path.resolve(root, source)
}

async function canonicalSourceFile(file: string): Promise<string> {
  try {
    return normalizedFile(await realpath(file))
  } catch {
    return normalizedFile(path.resolve(file))
  }
}

async function findRouteChunk(
  manifest: Manifest,
  root: string,
  route: RouteRecord,
): Promise<[string, ManifestChunk] | undefined> {
  const routeFile = await canonicalSourceFile(route.file)
  for (const [key, chunk] of Object.entries(manifest)) {
    const source = chunkSourceFile(root, key, chunk)
    if (
      source !== undefined &&
      (await canonicalSourceFile(source)) === routeFile
    ) {
      return [key, chunk]
    }
  }
  return undefined
}

async function manifestAssets(
  manifest: Manifest,
  root: string,
  route: RouteRecord,
): Promise<RenderAssets> {
  const entries = Object.entries(manifest).filter(
    ([, chunk]) => chunk.isEntry === true,
  )
  if (entries.length !== 1) {
    throw new Error(
      `Silen client manifest resolution failed for ${routeContext(route)}: expected exactly one client entry, found ${entries.length}`,
    )
  }
  const [entryKey, entry] = entries[0]!
  const routeEntry = await findRouteChunk(manifest, root, route)
  if (!routeEntry) {
    throw new Error(
      `Silen client manifest resolution failed for ${routeContext(route)}: no chunk represents ${route.relativeFile}`,
    )
  }

  const stylesheets = new Set<string>()
  const modulePreloads = new Set<string>()
  const visited = new Set<string>()

  const collect = (key: string, preloadChunk: boolean): void => {
    if (visited.has(key)) return
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) {
      throw new Error(
        `Silen client manifest resolution failed for ${routeContext(route)}: missing imported chunk ${key}`,
      )
    }
    if (preloadChunk) modulePreloads.add(chunk.file)
    for (const file of chunk.css ?? []) stylesheets.add(file)
    for (const imported of chunk.imports ?? []) collect(imported, true)
  }

  collect(entryKey, false)
  collect(routeEntry[0], true)
  modulePreloads.add(entry.file)

  return {
    base: '/',
    clientEntry: entry.file,
    stylesheets: [...stylesheets].sort(),
    modulePreloads: [...modulePreloads].sort(),
  }
}

function routeUrl(base: string, route: string): string {
  return route === '/' ? base : `${base}${route.slice(1)}`
}

async function loadRenderer(
  file: string,
  routes: readonly RouteRecord[],
): Promise<RendererModule> {
  try {
    const loaded: unknown = await import(
      `${pathToFileURL(file).href}?build=${randomUUID()}`
    )
    const render = (loaded as Partial<RendererModule>).render
    if (typeof render !== 'function') {
      throw new TypeError('the SSR entry does not export render(url)')
    }
    return { render }
  } catch (error) {
    throw buildError('SSR renderer loading', error, routes)
  }
}

async function renderRoutes(
  config: ResolvedConfig,
  outputs: readonly PlannedRouteOutput[],
  pages: readonly CompiledPage[],
  runner: PluginRunner,
  renderer: RendererModule,
  manifest: Manifest,
  outDir: string,
  favicon: ResolvedFavicon,
): Promise<void> {
  const pagesByRoute = new Map(pages.map((page) => [page.route, page]))
  const routes = outputs.map(({ route }) => route)
  for (const output of outputs) {
    const { route } = output
    try {
      const rendered = await renderer.render(routeUrl(config.base, route.path))
      if (rendered.status !== 200) {
        throw new Error(`canonical route rendered status ${rendered.status}`)
      }
      const assets = await manifestAssets(manifest, config.root, route)
      const page = pagesByRoute.get(route.path)
      if (!page) throw new Error(`missing compiled page data for ${route.path}`)
      const head = await runner.transformHead(publicPageData(page), {
        command: 'build',
        route: page.route,
        file: page.file,
        source: page.source,
      })
      const seo = createPageSeo(config, routes, route.path)
      const document = renderDocument(rendered, {
        ...assets,
        base: config.base,
        favicon,
        head,
        ...(seo === undefined ? {} : { seo }),
      })
      const destination = path.resolve(outDir, output.relativeFile)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, document, 'utf8')
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('Silen client manifest resolution failed')
      ) {
        throw error
      }
      throw buildError('SSR route rendering', error, [route])
    }
  }
}

interface NotFoundOutput {
  relativeFile: string
  url: string
}

function notFoundOutputs(config: ResolvedConfig): readonly NotFoundOutput[] {
  const roots = new Set<string>(['/'])
  for (const locale of config.themeConfig.locales ?? []) {
    if (typeof locale.root === 'string') roots.add(locale.root)
  }

  const outputs = new Map<string, NotFoundOutput>()
  for (const root of roots) {
    const absoluteRoot = root.startsWith('/') ? root : `/${root}`
    const mounted = resolveSiteLink(absoluteRoot, config.base)
    const pathname = new URL(mounted, 'https://silen.local').pathname
    const baseWithoutSlash = config.base.slice(0, -1)
    const route =
      pathname === baseWithoutSlash || pathname === config.base
        ? '/'
        : pathname.startsWith(config.base)
          ? `/${pathname.slice(config.base.length)}`
          : undefined
    if (route === undefined) continue

    const normalizedRoute =
      route === '/' || route.endsWith('/') ? route : `${route}/`
    const segments = safeRouteSegments(normalizedRoute)
    const relativeFile = path.join(...segments, '404.html')
    outputs.set(relativeFile, {
      relativeFile,
      url: `${routeUrl(config.base, normalizedRoute)}__silen_not_found__`,
    })
  }
  return [...outputs.values()]
}

async function renderNotFoundPages(
  config: ResolvedConfig,
  routes: readonly RouteRecord[],
  renderer: RendererModule,
  manifest: Manifest,
  outDir: string,
  favicon: ResolvedFavicon,
): Promise<void> {
  const assetRoute = routes.find((route) => route.path === '/') ?? routes[0]
  if (!assetRoute) return
  const assets = await manifestAssets(manifest, config.root, assetRoute)

  for (const output of notFoundOutputs(config)) {
    const rendered = await renderer.render(output.url)
    if (rendered.status !== 404) {
      throw new Error(`404 route rendered status ${rendered.status}`)
    }
    const document = renderDocument(rendered, {
      ...assets,
      base: config.base,
      favicon,
    })
    const destination = path.resolve(outDir, output.relativeFile)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, document, 'utf8')
  }
}

async function emitSearchIndex(
  config: ResolvedConfig,
  pages: readonly CompiledPage[],
  outDir: string,
): Promise<void> {
  if (config.themeConfig.search === false) return

  const destination = path.join(outDir, 'search-index.json')
  const temporary = path.join(outDir, `.search-index-${randomUUID()}.tmp`)
  const serialized = serializeSearchIndex(
    createSearchIndex(
      createPageSearchDocuments(pages, {
        lang: config.lang,
        ...(config.themeConfig.locales === undefined
          ? {}
          : { locales: config.themeConfig.locales }),
      }),
    ),
  )
  try {
    await writeFile(temporary, serialized, 'utf8')
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

function createAiPages(pages: readonly CompiledPage[], base: string): AiPage[] {
  return pages.map((page) => ({
    route: page.route,
    title: page.title,
    markdown: serializePageMarkdown(page, base),
    ...(page.description ? { description: page.description } : {}),
    ...(page.frontmatter.draft === true ? { draft: true } : {}),
    ...(page.frontmatter.ai === false ? { ai: false } : {}),
  }))
}

function publicPageData(page: CompiledPage): SilenPageData {
  return {
    title: page.title,
    description: page.description,
    frontmatter: page.frontmatter,
    headings: page.headings,
    links: page.links,
    data: page.data,
  }
}

async function renameExisting(
  source: string,
  destination: string,
): Promise<boolean> {
  try {
    await rename(source, destination)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function installOutput(
  stagedOutDir: string,
  outDir: string,
  backupDir: string,
): Promise<void> {
  const movedExisting = await renameExisting(outDir, backupDir)
  try {
    await rename(stagedOutDir, outDir)
  } catch (error) {
    if (movedExisting) await rename(backupDir, outDir)
    throw error
  }
  if (movedExisting) {
    await rm(backupDir, { force: true, recursive: true })
  }
}

async function buildSite(root: string): Promise<BuildResult> {
  const config = await resolveConfig(root, 'build')
  const runner = pluginRunnerFor(config)
  const routes = await scanRoutes(config.root)
  assertNoReservedContractRoutes(routes)
  await assertSafeOutDir(config, routes)
  const routeOutputs = planRouteOutputs(config.outDir, routes)
  const pages = await compilePages(routes, runner)

  const buildId = `${process.pid}-${randomUUID()}`
  const outParent = path.dirname(config.outDir)
  const outName = path.basename(config.outDir)
  const stagedOutDir = path.join(
    outParent,
    `.${outName}.silen-stage-${buildId}`,
  )
  const backupDir = path.join(outParent, `.${outName}.silen-backup-${buildId}`)
  const ssrOutDir = path.join(config.root, '.silen/.temp', `build-${buildId}`)
  let installed = false

  await mkdir(outParent, { recursive: true })
  try {
    await buildClient(config, stagedOutDir, routes, pages)
    await assertNoReservedContractPublicFiles(stagedOutDir)
    const ssrEntry = await buildServerRenderer(config, ssrOutDir, routes, pages)
    const favicon = await ensureBuildFavicon(stagedOutDir)
    const [manifest, renderer] = await Promise.all([
      readClientManifest(stagedOutDir, routes),
      loadRenderer(ssrEntry, routes),
    ])
    await renderRoutes(
      config,
      routeOutputs,
      pages,
      runner,
      renderer,
      manifest,
      stagedOutDir,
      favicon,
    )
    await renderNotFoundPages(
      config,
      routes,
      renderer,
      manifest,
      stagedOutDir,
      favicon,
    )
    await emitSitemap(config, routes, stagedOutDir)
    await generateAiArtifacts({
      outDir: stagedOutDir,
      site: config,
      pages: createAiPages(pages, config.base),
      config: config.ai,
    })
    await generateSiteContract({
      outDir: stagedOutDir,
      config,
    })
    validateInternalLinks(routes, pages, config.onBrokenLinks, config.base)
    await emitSearchIndex(config, pages, stagedOutDir)
    await rm(path.join(stagedOutDir, '.vite'), { force: true, recursive: true })
    await removeSourceMapFiles(stagedOutDir)
    await installOutput(stagedOutDir, config.outDir, backupDir)
    installed = true
    try {
      await runner.runBuildEnd({
        config,
        routes,
        pages: pages.map(publicPageData),
        outDir: config.outDir,
      })
      await removeSourceMapFiles(config.outDir)
    } catch (error) {
      throw new Error(
        `Silen installed the core output at ${config.outDir}, but ${errorDetail(error)}; plugin side effects were not rolled back`,
        { cause: error },
      )
    }
  } finally {
    await rm(ssrOutDir, { force: true, recursive: true })
    if (!installed) {
      await rm(stagedOutDir, { force: true, recursive: true })
    }
  }

  return {
    outDir: config.outDir,
    routes: routes.map((route) => ({ path: route.path, file: route.file })),
  }
}

export async function build(root: string): Promise<BuildResult> {
  const previousNodeEnv = process.env.NODE_ENV
  try {
    return await buildSite(root)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
}
