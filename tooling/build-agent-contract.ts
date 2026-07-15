import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { indexPublicDeclarations } from '../src/ai/contract/declarations.js'
import {
  assembleFrameworkContract,
  renderFrameworkContract,
} from '../src/ai/contract/framework.js'
import { SILEN_VERSION } from '../src/shared/version.js'

const projectRoot = process.cwd()
const distRoot = path.join(projectRoot, 'dist')
const outputRoot = path.join(distRoot, 'agent')
const packageManifest = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
) as { version?: unknown }

if (packageManifest.version !== SILEN_VERSION) {
  throw new TypeError('Silen package and Agent Contract versions do not match')
}

const bundle = await assembleFrameworkContract({
  publicExports: indexPublicDeclarations(distRoot),
})
const files = renderFrameworkContract(bundle)

await rm(outputRoot, { recursive: true, force: true })
await Promise.all(
  Object.entries(files).map(async ([relativePath, content]) => {
    const destination = path.join(outputRoot, relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, content, 'utf8')
  }),
)
