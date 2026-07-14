import { randomUUID } from 'node:crypto'
import {
  mkdir,
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
import type { ResolvedConfig } from '../shared/config.js'
import type { RouteRecord } from '../shared/page.js'
import { resolveConfig } from './config.js'
import { validateInternalLinks } from './links.js'
import { compilePage, createMdxPlugins, type CompiledPage } from './mdx.js'
import { silenPlugin } from './plugin.js'
import {
  renderDocument,
  type AssetPreload,
  type RenderAssets,
} from './render.js'
import { scanRoutes } from './routes.js'
import {
  createPageSearchDocuments,
  createSearchIndex,
  serializeSearchIndex,
} from './search.js'

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

async function compilePages(
  routes: readonly RouteRecord[],
): Promise<CompiledPage[]> {
  return Promise.all(
    routes.map(async (route) => {
      try {
        return await compilePage(route)
      } catch (error) {
        throw buildError('page metadata compilation', error, [route])
      }
    }),
  )
}

async function productionPlugins(
  config: ResolvedConfig,
): Promise<PluginOption[]> {
  return [
    react(),
    ...(await silenPlugin(config, { publicConfigOnly: true })),
    ...createMdxPlugins(),
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
      plugins: await productionPlugins(config),
      root: config.root,
      build: {
        assetsInlineLimit: 0,
        emptyOutDir: true,
        manifest: true,
        outDir,
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
      plugins: await productionPlugins(config),
      root: config.root,
      build: {
        assetsInlineLimit: 0,
        emptyOutDir: true,
        outDir,
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

function preloadType(file: string): AssetPreload['as'] | undefined {
  if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(file)) return 'image'
  if (/\.(?:eot|otf|ttf|woff2?)$/i.test(file)) return 'font'
  if (/\.(?:mp3|ogg|wav)$/i.test(file)) return 'audio'
  if (/\.(?:mp4|webm)$/i.test(file)) return 'video'
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
  const emittedAssets = new Set<string>()
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
    for (const file of chunk.assets ?? []) emittedAssets.add(file)
    for (const imported of chunk.imports ?? []) collect(imported, true)
  }

  collect(entryKey, false)
  collect(routeEntry[0], true)

  return {
    base: '/',
    clientEntry: entry.file,
    stylesheets: [...stylesheets].sort(),
    modulePreloads: [...modulePreloads].sort(),
    assetPreloads: [...emittedAssets].sort().flatMap((file): AssetPreload[] => {
      const as = preloadType(file)
      return as === undefined ? [] : [{ as, file }]
    }),
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
  renderer: RendererModule,
  manifest: Manifest,
  outDir: string,
): Promise<void> {
  for (const output of outputs) {
    const { route } = output
    try {
      const rendered = await renderer.render(routeUrl(config.base, route.path))
      if (rendered.status !== 200) {
        throw new Error(`canonical route rendered status ${rendered.status}`)
      }
      const assets = await manifestAssets(manifest, config.root, route)
      const document = renderDocument(rendered, {
        ...assets,
        base: config.base,
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

async function emitSearchIndex(
  config: ResolvedConfig,
  pages: readonly CompiledPage[],
  outDir: string,
): Promise<void> {
  if (config.themeConfig.search === false) return

  const destination = path.join(outDir, 'search-index.json')
  const temporary = path.join(outDir, `.search-index-${randomUUID()}.tmp`)
  const serialized = serializeSearchIndex(
    createSearchIndex(createPageSearchDocuments(pages)),
  )
  try {
    await writeFile(temporary, serialized, 'utf8')
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
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

export async function build(root: string): Promise<BuildResult> {
  const config = await resolveConfig(root, 'build')
  const routes = await scanRoutes(config.root)
  await assertSafeOutDir(config, routes)
  const routeOutputs = planRouteOutputs(config.outDir, routes)
  const pages = await compilePages(routes)
  validateInternalLinks(routes, pages, config.onBrokenLinks, config.base)

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
    await buildClient(config, stagedOutDir, routes)
    const ssrEntry = await buildServerRenderer(config, ssrOutDir, routes)
    const [manifest, renderer] = await Promise.all([
      readClientManifest(stagedOutDir, routes),
      loadRenderer(ssrEntry, routes),
    ])
    await renderRoutes(config, routeOutputs, renderer, manifest, stagedOutDir)
    await emitSearchIndex(config, pages, stagedOutDir)
    await rm(path.join(stagedOutDir, '.vite'), { force: true, recursive: true })
    await installOutput(stagedOutDir, config.outDir, backupDir)
    installed = true
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
