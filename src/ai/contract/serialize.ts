import type {
  SilenApiContract,
  SilenContractManifest,
} from '../../shared/ai-contract.js'
import { parseApiContract, parseContractManifest } from './schema.js'

function byText(left: string | undefined, right: string | undefined): number {
  return (left ?? '').localeCompare(right ?? '', 'en')
}

function normalizeManifest(
  input: SilenContractManifest,
): SilenContractManifest {
  const manifest = parseContractManifest(input)
  const resources = [...manifest.resources].sort(
    (left, right) => byText(left.id, right.id) || byText(left.lang, right.lang),
  )
  const tasks = [...manifest.tasks].sort(
    (left, right) => byText(left.id, right.id) || byText(left.lang, right.lang),
  )

  if (manifest.kind === 'silen-framework') {
    return { ...manifest, resources, tasks }
  }
  return {
    ...manifest,
    site: {
      ...manifest.site,
      locales: [...manifest.site.locales].sort((left, right) =>
        byText(left.lang, right.lang),
      ),
    },
    resources,
    tasks,
  }
}

function normalizeApi(input: SilenApiContract): SilenApiContract {
  const api = parseApiContract(input)
  return {
    ...api,
    config: {
      fields: [...api.config.fields].sort((left, right) =>
        byText(left.path, right.path),
      ),
    },
    cli: {
      commands: [...api.cli.commands].sort((left, right) =>
        byText(left.id, right.id),
      ),
    },
    mcp: {
      tools: [...api.mcp.tools].sort((left, right) =>
        byText(left.name, right.name),
      ),
    },
    exports: [...api.exports].sort(
      (left, right) =>
        byText(left.entryPoint, right.entryPoint) ||
        byText(left.symbol, right.symbol),
    ),
  }
}

export function serializeContractJson(
  value: SilenContractManifest | SilenApiContract,
): string {
  const normalized =
    'kind' in value ? normalizeManifest(value) : normalizeApi(value)
  return `${JSON.stringify(normalized, null, 2)}\n`
}
