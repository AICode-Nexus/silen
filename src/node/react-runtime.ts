import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Alias, Plugin } from 'vite'

const runtimeModulePrefix = '\0silen:react-runtime:'
const requireFromSilen = createRequire(import.meta.url)

function packageRoot(specifier: string): string {
  return path.dirname(fileURLToPath(import.meta.resolve(specifier)))
}

function runtimeModuleSource(specifier: string): string {
  const runtime = requireFromSilen(specifier) as Record<string, unknown>
  const exports = Object.keys(runtime)
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default')
    .map(
      (name) =>
        `export const ${name} = __silenRuntime[${JSON.stringify(name)}]`,
    )
    .join('\n')
  return `import { createRequire as __silenCreateRequire } from 'node:module'
const __silenRuntime = __silenCreateRequire(${JSON.stringify(import.meta.url)})(${JSON.stringify(specifier)})
${exports}
export default __silenRuntime.default ?? __silenRuntime
`
}

function browserRuntimeModuleSource(specifier: string): string {
  const resolved = fileURLToPath(import.meta.resolve(specifier))
  return `export * from ${JSON.stringify(resolved)}
import __silenRuntimeDefault from ${JSON.stringify(resolved)}
export default __silenRuntimeDefault
`
}

function runtimeAlias(packageName: 'react' | 'react-dom'): Alias {
  return {
    find: new RegExp(`^${packageName}(?=/|$)`),
    replacement: packageRoot(`${packageName}/package.json`),
  }
}

export function reactRuntimeAliases(): readonly Alias[] {
  return [runtimeAlias('react'), runtimeAlias('react-dom')]
}

export function reactRuntimeResolver(): Plugin {
  const packages = (['react', 'react-dom'] as const).map((name) => ({
    name,
    root: packageRoot(`${name}/package.json`),
  }))
  return {
    name: 'silen:react-runtime',
    enforce: 'pre',
    resolveId(source, _importer, options) {
      for (const runtime of packages) {
        let specifier: string | undefined
        if (source === runtime.name || source.startsWith(`${runtime.name}/`)) {
          specifier = source
        } else if (
          source === runtime.root ||
          source.startsWith(`${runtime.root}/`)
        ) {
          specifier = `${runtime.name}${source.slice(runtime.root.length)}`
        }
        if (!specifier) continue
        const environmentName = (
          this as typeof this & {
            readonly environment?: { readonly name?: string }
          }
        ).environment?.name
        const serverRuntime = options.ssr === true || environmentName === 'ssr'
        return serverRuntime
          ? `${runtimeModulePrefix}${specifier}`
          : fileURLToPath(import.meta.resolve(specifier))
      }
      return null
    },
    load(id, options) {
      if (!id.startsWith(runtimeModulePrefix)) return null
      const specifier = id.slice(runtimeModulePrefix.length)
      return options?.ssr === true
        ? runtimeModuleSource(specifier)
        : browserRuntimeModuleSource(specifier)
    },
  }
}
