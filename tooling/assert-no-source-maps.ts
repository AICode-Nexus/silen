import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'

const configuredRoots = process.argv.slice(2)
const roots =
  configuredRoots.length === 0
    ? ['dist', 'website/.silen/dist']
    : configuredRoots

const sourceMaps: string[] = []

async function scan(file: string): Promise<void> {
  let stats: Awaited<ReturnType<typeof lstat>>
  try {
    stats = await lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  if (stats.isDirectory()) {
    const entries = await readdir(file)
    await Promise.all(entries.map((entry) => scan(path.join(file, entry))))
    return
  }

  if (stats.isFile() && file.endsWith('.map')) {
    sourceMaps.push(path.relative(process.cwd(), file) || file)
  }
}

await Promise.all(roots.map((root) => scan(path.resolve(root))))

if (sourceMaps.length > 0) {
  console.error(
    [
      'Source map files are not allowed in release artifacts:',
      ...sourceMaps.sort().map((file) => `- ${file}`),
    ].join('\n'),
  )
  process.exit(1)
}
