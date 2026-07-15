import path from 'node:path'
import type { Node } from 'typescript/unstable/ast'
import {
  API,
  SymbolFlags,
  type Symbol as TypeScriptSymbol,
} from 'typescript/unstable/sync'
import type { SilenPublicExportContract } from '../../shared/ai-contract.js'

const publicEntryPoints = [
  { entryPoint: '.', declaration: 'index.d.ts' },
  { entryPoint: './client', declaration: 'client/index.d.ts' },
  { entryPoint: './theme', declaration: 'theme-default/index.d.ts' },
  { entryPoint: './ai', declaration: 'ai/index.d.ts' },
] as const

function symbolKind(symbol: TypeScriptSymbol): string {
  const flags = symbol.flags
  if (flags & SymbolFlags.Class) return 'class'
  if (flags & SymbolFlags.Interface) return 'interface'
  if (flags & SymbolFlags.TypeAlias) return 'type'
  if (flags & SymbolFlags.Enum) return 'enum'
  if (flags & SymbolFlags.Function) return 'function'
  if (flags & SymbolFlags.Variable) return 'variable'
  if (flags & SymbolFlags.Module) return 'module'
  return 'export'
}

function declarationSignature(
  declaration: Node,
  printNode: (node: Node) => string,
): string {
  const signature = printNode(declaration).trim()
  if (signature.length > 20_000) {
    throw new TypeError('Public declaration signature exceeds 20000 characters')
  }
  return signature
}

export function indexPublicDeclarations(
  distRoot: string,
): readonly SilenPublicExportContract[] {
  const root = path.resolve(distRoot)
  const entryFiles = publicEntryPoints.map((entry) =>
    path.join(root, entry.declaration),
  )
  const api = new API({ cwd: root })
  const snapshot = api.updateSnapshot({ openFiles: entryFiles })
  const exports: SilenPublicExportContract[] = []

  try {
    for (const entry of publicEntryPoints) {
      const entryFile = path.join(root, entry.declaration)
      const project = snapshot.getDefaultProjectForFile(entryFile)
      const source = project?.program.getSourceFile(entryFile)
      if (project === undefined || source === undefined) {
        throw new TypeError(`Missing emitted declaration ${entry.declaration}`)
      }
      const moduleSymbol = project.checker.getSymbolAtLocation(source)
      if (moduleSymbol === undefined) {
        throw new TypeError(
          `Cannot inspect emitted declaration ${entry.declaration}`,
        )
      }
      for (const exported of project.checker.getExportsOfModule(moduleSymbol)) {
        const symbol =
          exported.flags & SymbolFlags.Alias
            ? project.checker.getAliasedSymbol(exported)
            : exported
        const declaration = symbol.declarations[0]?.resolve()
        if (declaration === undefined) continue
        const declarationFile = path.relative(
          root,
          declaration.getSourceFile().fileName,
        )
        if (
          declarationFile.startsWith('..') ||
          path.isAbsolute(declarationFile)
        ) {
          throw new TypeError('Public declaration resolved outside dist')
        }
        exports.push({
          entryPoint: entry.entryPoint,
          symbol: exported.name,
          kind: symbolKind(symbol),
          signature: declarationSignature(declaration, (node) =>
            project.emitter.printNode(node),
          ),
          declaration: `dist/${declarationFile.replaceAll('\\', '/')}`,
        })
      }
    }
  } finally {
    snapshot.dispose()
    api.close()
  }

  return exports.sort(
    (left, right) =>
      left.entryPoint.localeCompare(right.entryPoint, 'en') ||
      left.symbol.localeCompare(right.symbol, 'en'),
  )
}
