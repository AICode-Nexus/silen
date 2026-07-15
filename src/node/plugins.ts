import type { ResolvedConfig, UserConfig } from '../shared/config.js'
import type {
  ResolvedSilenPlugin,
  SilenBuildEndContext,
  SilenHeadEntry,
  SilenMdxExtensions,
  SilenPageContext,
  SilenPageData,
  SilenPlugin,
  SilenPluginEntry,
  SilenPluginFactory,
  SilenPluginFactoryContext,
} from '../shared/plugin.js'
import { hasExecutableUrlScheme, normalizedUrlScheme } from '../shared/url.js'
import type { Plugin } from 'vite'

const pluginFields = new Set([
  'name',
  'id',
  'config',
  'configResolved',
  'extendMdx',
  'vite',
  'clientModules',
  'transformPageData',
  'transformHead',
  'buildEnd',
])

const hookFields = new Set(
  [...pluginFields].filter((field) => field !== 'name' && field !== 'id'),
)

const runners = new WeakMap<ResolvedConfig, PluginRunner>()

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function pluginHookError(
  identity: string,
  hook: string,
  error: unknown,
): Error {
  return new Error(
    `Silen plugin ${identity} failed in ${hook}: ${errorDetail(error)}`,
    { cause: error },
  )
}

function pluginObject(value: unknown, index: number): SilenPlugin {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(
      `Silen plugin factory at index ${index} must return an object`,
    )
  }

  for (const field of Object.keys(value)) {
    if (!pluginFields.has(field)) {
      throw new TypeError(
        `Silen plugin at index ${index} has unknown field ${field}`,
      )
    }
  }

  const candidate = value as Partial<SilenPlugin>
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') {
    throw new TypeError(
      `Silen plugin at index ${index} requires a non-empty name`,
    )
  }
  if (
    candidate.id !== undefined &&
    (typeof candidate.id !== 'string' || candidate.id.trim() === '')
  ) {
    throw new TypeError(
      `Silen plugin ${candidate.name} requires a non-empty id`,
    )
  }
  for (const hook of hookFields) {
    const value = candidate[hook as keyof SilenPlugin]
    if (value !== undefined && typeof value !== 'function') {
      throw new TypeError(
        `Silen plugin ${candidate.name} field ${hook} must be a function`,
      )
    }
  }
  return candidate as SilenPlugin
}

function pluginEntry(
  entry: SilenPluginEntry,
  index: number,
): { factory: SilenPluginFactory<never>; options: unknown } {
  if (typeof entry === 'function') {
    return { factory: entry, options: undefined }
  }
  if (
    !Array.isArray(entry) ||
    entry.length !== 2 ||
    typeof entry[0] !== 'function'
  ) {
    throw new TypeError(
      `Silen plugin entry at index ${index} must be a factory or [factory, options]`,
    )
  }
  const tuple = entry as readonly [SilenPluginFactory<never>, unknown]
  return { factory: tuple[0], options: tuple[1] }
}

async function callHook<Value>(
  plugin: ResolvedSilenPlugin,
  hook: string,
  operation: () => Value | PromiseLike<Value>,
): Promise<Value> {
  try {
    return await operation()
  } catch (error) {
    throw pluginHookError(plugin.identity, hook, error)
  }
}

export class PluginRunner {
  readonly plugins: readonly ResolvedSilenPlugin[]
  readonly context: SilenPluginFactoryContext
  private mdxExtensionsResult?: Promise<Required<SilenMdxExtensions>>
  private clientModulesResult?: Promise<readonly string[]>

  constructor(
    plugins: readonly ResolvedSilenPlugin[],
    context: SilenPluginFactoryContext,
  ) {
    this.plugins = plugins
    this.context = context
  }

  get identities(): string[] {
    return this.plugins.map((plugin) => plugin.identity)
  }

  hasHook(hook: keyof SilenPlugin): boolean {
    return this.plugins.some((plugin) => typeof plugin[hook] === 'function')
  }

  async runConfig(input: UserConfig): Promise<UserConfig> {
    let config = input
    for (const plugin of this.plugins) {
      if (!plugin.config) continue
      const patch = await callHook(plugin, 'config', () =>
        plugin.config!(readonlyClone(config), this.context),
      )
      if (patch === undefined) continue
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        throw pluginHookError(
          plugin.identity,
          'config',
          new TypeError('config hook must return an object or undefined'),
        )
      }
      if (Object.hasOwn(patch, 'plugins')) {
        throw pluginHookError(
          plugin.identity,
          'config',
          new TypeError('config hook cannot replace plugins'),
        )
      }
      config = { ...config, ...patch }
    }
    return config
  }

  async runConfigResolved(config: Readonly<ResolvedConfig>): Promise<void> {
    const readonlyConfig = deepFreeze(config)
    for (const plugin of this.plugins) {
      if (!plugin.configResolved) continue
      await callHook(plugin, 'configResolved', () =>
        plugin.configResolved!(readonlyConfig),
      )
    }
  }

  async collectMdxExtensions(): Promise<Required<SilenMdxExtensions>> {
    this.mdxExtensionsResult ??= this.resolveMdxExtensions()
    const result = await this.mdxExtensionsResult
    return {
      remarkPlugins: [...result.remarkPlugins],
      rehypePlugins: [...result.rehypePlugins],
    }
  }

  private async resolveMdxExtensions(): Promise<Required<SilenMdxExtensions>> {
    const remarkPlugins: unknown[] = []
    const rehypePlugins: unknown[] = []
    for (const plugin of this.plugins) {
      if (!plugin.extendMdx) continue
      const extension = await callHook(plugin, 'extendMdx', () =>
        plugin.extendMdx!(),
      )
      if (extension === undefined) continue
      if (typeof extension !== 'object' || extension === null) {
        throw pluginHookError(
          plugin.identity,
          'extendMdx',
          new TypeError('extendMdx hook must return an object or undefined'),
        )
      }
      if (
        (extension.remarkPlugins !== undefined &&
          !Array.isArray(extension.remarkPlugins)) ||
        (extension.rehypePlugins !== undefined &&
          !Array.isArray(extension.rehypePlugins))
      ) {
        throw pluginHookError(
          plugin.identity,
          'extendMdx',
          new TypeError('extendMdx plugin lists must be arrays'),
        )
      }
      remarkPlugins.push(
        ...((extension.remarkPlugins ?? []) as readonly unknown[]),
      )
      rehypePlugins.push(
        ...((extension.rehypePlugins ?? []) as readonly unknown[]),
      )
    }
    return { remarkPlugins, rehypePlugins }
  }

  async collectVitePlugins(): Promise<Plugin[]> {
    const plugins: Plugin[] = []
    for (const plugin of this.plugins) {
      if (!plugin.vite) continue
      const contribution = await callHook(plugin, 'vite', () => plugin.vite!())
      plugins.push(
        ...(await normalizeVitePlugins(contribution, plugin.identity)),
      )
    }
    return plugins
  }

  async collectClientModules(): Promise<string[]> {
    this.clientModulesResult ??= this.resolveClientModules()
    return [...(await this.clientModulesResult)]
  }

  private async resolveClientModules(): Promise<readonly string[]> {
    const modules: string[] = []
    for (const plugin of this.plugins) {
      if (!plugin.clientModules) continue
      const result = await callHook(plugin, 'clientModules', () =>
        plugin.clientModules!(),
      )
      if (result === undefined) continue
      const entries = typeof result === 'string' ? [result] : result
      if (
        !Array.isArray(entries) ||
        entries.some((entry) => typeof entry !== 'string')
      ) {
        throw pluginHookError(
          plugin.identity,
          'clientModules',
          new TypeError('clientModules must return module id strings'),
        )
      }
      for (const entry of entries as readonly string[]) {
        const moduleId = entry.trim()
        const scheme = normalizedUrlScheme(moduleId)
        if (
          moduleId === '' ||
          moduleId.includes('\0') ||
          scheme === 'data' ||
          scheme === 'http' ||
          scheme === 'https' ||
          scheme === 'javascript' ||
          scheme === 'node' ||
          scheme === 'vbscript'
        ) {
          throw pluginHookError(
            plugin.identity,
            'clientModules',
            new TypeError(`invalid client module id ${JSON.stringify(entry)}`),
          )
        }
        modules.push(moduleId)
      }
    }
    return modules
  }

  async transformPageData(
    input: SilenPageData,
    context: SilenPageContext,
  ): Promise<SilenPageData> {
    let page = normalizePageData(input)
    const readonlyContext = deepFreeze({ ...context })
    for (const plugin of this.plugins) {
      if (!plugin.transformPageData) continue
      const patch = await callHook(plugin, 'transformPageData', () =>
        plugin.transformPageData!(deepFreeze(page), readonlyContext),
      )
      if (patch === undefined) continue
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        throw pluginHookError(
          plugin.identity,
          'transformPageData',
          new TypeError('transformPageData must return an object or undefined'),
        )
      }
      page = await callHook(plugin, 'transformPageData', () =>
        normalizePageData({
          ...page,
          ...patch,
          data: { ...page.data, ...(patch.data ?? {}) },
        }),
      )
    }
    return page
  }

  async transformHead(
    page: SilenPageData,
    context: SilenPageContext,
  ): Promise<SilenHeadEntry[]> {
    const readonlyPage = deepFreeze(normalizePageData(page))
    const readonlyContext = deepFreeze({ ...context })
    const entries: SilenHeadEntry[] = []
    for (const plugin of this.plugins) {
      if (!plugin.transformHead) continue
      const result = await callHook(plugin, 'transformHead', () =>
        plugin.transformHead!(readonlyPage, readonlyContext),
      )
      if (result === undefined) continue
      if (!Array.isArray(result)) {
        throw pluginHookError(
          plugin.identity,
          'transformHead',
          new TypeError('transformHead must return an array or undefined'),
        )
      }
      entries.push(
        ...(result as readonly SilenHeadEntry[]).map((entry) =>
          normalizeHeadEntry(entry, plugin.identity),
        ),
      )
    }
    return entries
  }

  async runBuildEnd(context: SilenBuildEndContext): Promise<void> {
    const readonlyContext = deepFreeze(context)
    for (const plugin of this.plugins) {
      if (!plugin.buildEnd) continue
      await callHook(plugin, 'buildEnd', () =>
        plugin.buildEnd!(readonlyContext),
      )
    }
  }
}

function protectedVirtualId(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const clean = value.startsWith('\0') ? value.slice(1) : value
  return clean.startsWith('virtual:silen/')
}

function guardedViteResult(
  identity: string,
  hook: string,
  id: unknown,
  result: unknown,
): unknown {
  if (protectedVirtualId(id) && result !== undefined && result !== null) {
    throw pluginHookError(
      identity,
      `vite.${hook}`,
      new Error(`cannot override protected module ${String(id)}`),
    )
  }
  return result
}

function wrapViteHook(
  hook: unknown,
  identity: string,
  hookName: string,
  idIndex: number,
): unknown {
  const wrap = (handler: (...arguments_: unknown[]) => unknown) =>
    function guarded(this: unknown, ...arguments_: unknown[]): unknown {
      const result = handler.apply(this, arguments_)
      if (
        (typeof result === 'object' || typeof result === 'function') &&
        result !== null &&
        'then' in result &&
        typeof result.then === 'function'
      ) {
        return Promise.resolve(result).then((value) =>
          guardedViteResult(identity, hookName, arguments_[idIndex], value),
        )
      }
      return guardedViteResult(identity, hookName, arguments_[idIndex], result)
    }

  if (typeof hook === 'function') {
    return wrap(hook as (...arguments_: unknown[]) => unknown)
  }
  if (
    typeof hook === 'object' &&
    hook !== null &&
    'handler' in hook &&
    typeof hook.handler === 'function'
  ) {
    return {
      ...hook,
      handler: wrap(hook.handler as (...arguments_: unknown[]) => unknown),
    }
  }
  return hook
}

function protectVitePlugin(plugin: Plugin, identity: string): Plugin {
  return {
    ...plugin,
    resolveId: wrapViteHook(plugin.resolveId, identity, 'resolveId', 0),
    load: wrapViteHook(plugin.load, identity, 'load', 0),
    transform: wrapViteHook(plugin.transform, identity, 'transform', 1),
  } as Plugin
}

async function normalizeVitePlugins(
  option: unknown,
  identity: string,
): Promise<Plugin[]> {
  const resolved = await option
  if (resolved === false || resolved === null || resolved === undefined)
    return []
  if (Array.isArray(resolved)) {
    const nested = await Promise.all(
      resolved.map((entry) => normalizeVitePlugins(entry, identity)),
    )
    return nested.flat()
  }
  if (
    typeof resolved !== 'object' ||
    !('name' in resolved) ||
    typeof resolved.name !== 'string'
  ) {
    throw pluginHookError(
      identity,
      'vite',
      new TypeError('vite hook must return Vite plugins'),
    )
  }
  return [protectVitePlugin(resolved as Plugin, identity)]
}

function normalizedJsonValue(
  value: unknown,
  label: string,
  ancestors: Set<object>,
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label} must contain only finite numbers`)
    }
    return value
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${label} must be JSON-serializable`)
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${label} must not contain circular references`)
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        normalizedJsonValue(entry, `${label}[${index}]`, ancestors),
      )
    }
    const prototype = Object.getPrototypeOf(value) as unknown
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${label} must contain only plain objects`)
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizedJsonValue(entry, `${label}.${key}`, ancestors),
      ]),
    )
  } finally {
    ancestors.delete(value)
  }
}

function normalizedJsonObject(
  value: unknown,
  label: string,
): Record<string, never> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return normalizedJsonValue(value, label, new Set()) as Record<string, never>
}

function deepFreeze<Value>(value: Value): Readonly<Value> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function readonlyClone<Value>(
  value: Value,
  clones = new WeakMap<object, unknown>(),
): Readonly<Value> {
  if (typeof value !== 'object' || value === null) return value
  const existing = clones.get(value)
  if (existing !== undefined) return existing as Readonly<Value>

  const clone: unknown[] | Record<string, unknown> = Array.isArray(value)
    ? []
    : {}
  clones.set(value, clone)
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(clone, key, {
      configurable: false,
      enumerable: true,
      value: readonlyClone(child, clones),
      writable: false,
    })
  }
  return Object.freeze(clone) as Readonly<Value>
}

function normalizePageData(value: SilenPageData): SilenPageData {
  const allowedFields = new Set([
    'title',
    'description',
    'frontmatter',
    'headings',
    'links',
    'data',
  ])
  const unknownField = Object.keys(value).find(
    (field) => !allowedFields.has(field),
  )
  if (unknownField !== undefined) {
    throw new TypeError(
      `page data has unknown field ${unknownField}; extension values belong in data`,
    )
  }
  if (
    typeof value.title !== 'string' ||
    typeof value.description !== 'string'
  ) {
    throw new TypeError('page title and description must be strings')
  }
  if (!Array.isArray(value.headings) || !Array.isArray(value.links)) {
    throw new TypeError('page headings and links must be arrays')
  }
  const normalized = normalizedJsonObject(
    value,
    'page data',
  ) as unknown as SilenPageData
  if (
    typeof normalized.frontmatter !== 'object' ||
    normalized.frontmatter === null ||
    Array.isArray(normalized.frontmatter) ||
    typeof normalized.data !== 'object' ||
    normalized.data === null ||
    Array.isArray(normalized.data)
  ) {
    throw new TypeError('page frontmatter and extension data must be objects')
  }
  if (
    normalized.links.some((link) => typeof link !== 'string') ||
    normalized.headings.some(
      (heading) =>
        typeof heading !== 'object' ||
        heading === null ||
        !Number.isInteger(heading.depth) ||
        typeof heading.title !== 'string' ||
        typeof heading.slug !== 'string',
    )
  ) {
    throw new TypeError('page headings and links contain invalid entries')
  }
  return normalized
}

function normalizeHeadEntry(
  value: SilenHeadEntry,
  identity: string,
): SilenHeadEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw pluginHookError(
      identity,
      'transformHead',
      new TypeError('head entries must be objects'),
    )
  }
  if (typeof value.tag !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(value.tag)) {
    throw pluginHookError(
      identity,
      'transformHead',
      new TypeError(`invalid head tag ${JSON.stringify(value.tag)}`),
    )
  }
  const tag = value.tag.toLowerCase()
  if (!new Set(['link', 'meta', 'noscript', 'script', 'style']).has(tag)) {
    throw pluginHookError(
      identity,
      'transformHead',
      new TypeError(`unsupported head tag ${JSON.stringify(value.tag)}`),
    )
  }
  for (const [name, attribute] of Object.entries(value.attributes ?? {})) {
    if (!/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(name)) {
      throw pluginHookError(
        identity,
        'transformHead',
        new TypeError(`invalid head attribute ${name}`),
      )
    }
    if (typeof attribute !== 'string' && typeof attribute !== 'boolean') {
      throw pluginHookError(
        identity,
        'transformHead',
        new TypeError(`invalid value for head attribute ${name}`),
      )
    }
    if (
      typeof attribute === 'string' &&
      (name.toLowerCase() === 'href' || name.toLowerCase() === 'src') &&
      hasExecutableUrlScheme(attribute)
    ) {
      throw pluginHookError(
        identity,
        'transformHead',
        new TypeError(`unsafe URL protocol for head attribute ${name}`),
      )
    }
  }
  if (value.children !== undefined && typeof value.children !== 'string') {
    throw pluginHookError(
      identity,
      'transformHead',
      new TypeError('head entry children must be a string'),
    )
  }
  if ((tag === 'link' || tag === 'meta') && value.children !== undefined) {
    throw pluginHookError(
      identity,
      'transformHead',
      new TypeError(`${tag} head entries cannot have children`),
    )
  }
  return {
    tag,
    ...(value.attributes === undefined
      ? {}
      : { attributes: { ...value.attributes } }),
    ...(value.children === undefined ? {} : { children: value.children }),
  }
}

export async function createPluginRunner(
  entries: readonly SilenPluginEntry[],
  context: SilenPluginFactoryContext,
): Promise<PluginRunner> {
  const plugins: ResolvedSilenPlugin[] = []
  const identities = new Set<string>()

  for (const [index, rawEntry] of entries.entries()) {
    if (rawEntry === false || rawEntry === null || rawEntry === undefined)
      continue
    const { factory, options } = pluginEntry(rawEntry, index)
    let result: unknown
    try {
      result = await factory(context, options as never)
    } catch (error) {
      throw new Error(
        `Silen plugin factory at index ${index} failed: ${errorDetail(error)}`,
        { cause: error },
      )
    }
    const plugin = pluginObject(result, index)
    const id = plugin.id ?? 'default'
    const identity = `${plugin.name}:${id}`
    if (identities.has(identity)) {
      throw new TypeError(`Duplicate Silen plugin ${identity}`)
    }
    identities.add(identity)
    plugins.push(Object.freeze({ ...plugin, id, identity }))
  }

  return new PluginRunner(Object.freeze(plugins), Object.freeze({ ...context }))
}

export function attachPluginRunner(
  config: ResolvedConfig,
  runner: PluginRunner,
): void {
  runners.set(config, runner)
}

export function pluginRunnerFor(config: ResolvedConfig): PluginRunner {
  const existing = runners.get(config)
  if (existing) return existing
  const runner = new PluginRunner(config.plugins ?? [], {
    command: config.command,
    root: config.root,
    configFile: config.configFile,
  })
  runners.set(config, runner)
  return runner
}
