export type SilenJsonValue =
  | boolean
  | number
  | string
  | null
  | readonly SilenJsonValue[]
  | { readonly [key: string]: SilenJsonValue }

export interface SilenContractGenerator {
  readonly name: 'Silen'
  readonly version: string
}

export interface SilenContractLocale {
  readonly lang: string
  readonly root: string
  readonly label?: string
}

export interface SilenContractResource {
  readonly id: string
  readonly format: string
  readonly url: string
  readonly lang?: string
}

interface SilenTaskMetadataBase {
  readonly id: string
  readonly title: string
  readonly contractVersion: 1
  readonly lang?: string
}

export interface SilenReadTaskMetadata extends SilenTaskMetadataBase {
  readonly mode: 'read'
  readonly requiresExplicitAuthorization?: false
}

export interface SilenWriteTaskMetadata extends SilenTaskMetadataBase {
  readonly mode: 'write'
  readonly requiresExplicitAuthorization: true
}

export type SilenTaskMetadata = SilenReadTaskMetadata | SilenWriteTaskMetadata

export type SilenContractTask = SilenTaskMetadata & {
  readonly url: string
}

export interface SilenMcpCapability {
  readonly transport: 'stdio'
  readonly localOnly: true
  readonly readOnlyByDefault: true
  readonly writeRequiresFlag: '--allow-write'
}

export interface SilenContractCapabilities {
  readonly llmsTxt: boolean
  readonly llmsFullTxt: boolean
  readonly markdownRoutes: boolean
  readonly index: boolean
  readonly mcp: SilenMcpCapability
}

export interface SilenContractSite {
  readonly title: string
  readonly description: string
  readonly base: string
  readonly lang: string
  readonly locales: readonly SilenContractLocale[]
}

interface SilenContractManifestBase {
  readonly schemaVersion: 1
  readonly generator: SilenContractGenerator
  readonly capabilities: SilenContractCapabilities
  readonly resources: readonly SilenContractResource[]
  readonly tasks: readonly SilenContractTask[]
}

export interface SilenFrameworkContractManifest extends SilenContractManifestBase {
  readonly kind: 'silen-framework'
}

export interface SilenSiteContractManifest extends SilenContractManifestBase {
  readonly kind: 'silen-site'
  readonly site: SilenContractSite
}

export type SilenContractManifest =
  SilenFrameworkContractManifest | SilenSiteContractManifest

export interface SilenConfigApiField {
  readonly path: string
  readonly type: string
  readonly required: boolean
  readonly default?: SilenJsonValue
  readonly constraints?: readonly string[]
  readonly description: string
  readonly introduced: 1
}

export interface SilenCliArgumentContract {
  readonly name: string
  readonly required: boolean
  readonly variadic?: boolean
  readonly description?: string
}

export interface SilenCliOptionContract {
  readonly name: string
  readonly description: string
  readonly required: boolean
  readonly default?: SilenJsonValue
}

export type SilenCliSideEffect = 'read' | 'write' | 'server' | 'build'

export interface SilenCliCommandContract {
  readonly id: string
  readonly syntax: string
  readonly description: string
  readonly sideEffect: SilenCliSideEffect
  readonly arguments: readonly SilenCliArgumentContract[]
  readonly options: readonly SilenCliOptionContract[]
}

export interface SilenMcpToolAnnotations {
  readonly readOnlyHint: boolean
  readonly destructiveHint: boolean
  readonly idempotentHint: boolean
  readonly openWorldHint: boolean
}

export interface SilenMcpToolContract {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: { readonly [key: string]: SilenJsonValue }
  readonly annotations: SilenMcpToolAnnotations
  readonly requiresExplicitAuthorization: boolean
}

export interface SilenPublicExportContract {
  readonly entryPoint: string
  readonly symbol: string
  readonly kind: string
  readonly signature: string
  readonly declaration: string
}

export interface SilenApiContract {
  readonly schemaVersion: 1
  readonly generator: SilenContractGenerator
  readonly config: {
    readonly fields: readonly SilenConfigApiField[]
  }
  readonly cli: {
    readonly commands: readonly SilenCliCommandContract[]
  }
  readonly mcp: {
    readonly tools: readonly SilenMcpToolContract[]
  }
  readonly exports: readonly SilenPublicExportContract[]
}
