import { request } from 'node:http'
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { build } from '../src/node/build'
import {
  createDevServer,
  createPreviewServer,
  type SilenServer,
} from '../src/node/server'

const temporaryDirectories: string[] = []
const runningServers: SilenServer[] = []
let root: string

function rawStatus(url: URL, requestPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      {
        host: url.hostname,
        method: 'GET',
        path: requestPath,
        port: url.port,
      },
      (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode ?? 0))
      },
    )
    clientRequest.on('error', reject)
    clientRequest.end()
  })
}

function expectViteHmrConnection(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const websocketUrl = new URL(url)
    websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(websocketUrl, 'vite-hmr')
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error(`Timed out connecting to Vite HMR at ${websocketUrl}`))
    }, 5_000)

    socket.addEventListener('message', (event) => {
      let payload: unknown
      try {
        payload = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (
        typeof payload === 'object' &&
        payload !== null &&
        (payload as { type?: unknown }).type === 'connected'
      ) {
        clearTimeout(timeout)
        socket.close()
        resolve()
      }
    })
    socket.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new Error(`Failed connecting to Vite HMR at ${websocketUrl}`))
    })
  })
}

beforeAll(async () => {
  const testTemp = path.resolve('.silen/.temp/tests')
  await mkdir(testTemp, { recursive: true })
  root = await mkdtemp(path.join(testTemp, 'silen-server-'))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, '.silen'), { recursive: true })
  const packageEntry = path.resolve('src/index.ts')
  await Promise.all([
    writeFile(
      path.join(root, '.silen/config.ts'),
      `import { defineConfig } from ${JSON.stringify(packageEntry)}
export default defineConfig({
  title: 'Server fixture',
  description: 'HTTP integration fixture',
  base: '/docs/',
  outDir: 'output',
})
`,
    ),
    writeFile(
      path.join(root, 'index.mdx'),
      `import './page.css'

# Development home

Rendered by Vite SSR.
`,
    ),
    writeFile(
      path.join(root, 'guide.mdx'),
      `# Preview guide

Built output only.
`,
    ),
    writeFile(path.join(root, 'page.css'), 'body { color: #123456; }\n'),
    writeFile(path.join(root, 'secret.txt'), 'outside output\n'),
  ])
})

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()))
})

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('development server', () => {
  it('serves base-aware Vite SSR HTML with 200 and 404 statuses', async () => {
    const server = await createDevServer(root, {
      host: '127.0.0.1',
      port: 0,
    })
    runningServers.push(server)

    expect(server.port).toBeGreaterThan(0)
    expect(server.url).toBe(`http://127.0.0.1:${server.port}/docs/`)

    const home = await fetch(server.url)
    expect(home.status).toBe(200)
    expect(home.headers.get('content-type')).toContain('text/html')
    const homeHtml = await home.text()
    expect(homeHtml).toContain('<h1>Development home</h1>')
    expect(homeHtml).toContain('Rendered by Vite SSR.')
    expect(homeHtml).toContain('/docs/@vite/client')
    expect(homeHtml).toContain('/docs/@react-refresh')
    expect(homeHtml).toContain('injectIntoGlobalHook(window)')
    expect(homeHtml).toContain('/docs/@fs/')
    await expectViteHmrConnection(server.url)

    const transformedClientModule = await fetch(
      new URL(
        `@fs${path.resolve('src/client/data.tsx')}`,
        `http://127.0.0.1:${server.port}/docs/`,
      ),
    )
    const transformedClientSource = await transformedClientModule.text()
    expect(transformedClientModule.status, transformedClientSource).toBe(200)
    expect(transformedClientSource).toContain('function $RefreshSig$')
    expect(transformedClientSource).not.toContain('jsxDEV')

    const missing = await fetch(new URL('missing', server.url))
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toContain('text/html')
    expect(await missing.text()).toContain('<h1>404</h1>')

    const outsideBase = await fetch(`http://127.0.0.1:${server.port}/outside`)
    expect(outsideBase.status).toBe(404)

    await server.close()
    await expect(server.close()).resolves.toBeUndefined()
    await expect(fetch(server.url)).rejects.toThrow()
  }, 30_000)

  it('validates port values before opening a listener', async () => {
    await expect(createDevServer(root, { port: '123abc' })).rejects.toThrow(
      'port',
    )
    await expect(createDevServer(root, { port: 65_536 })).rejects.toThrow(
      'port',
    )
  })

  it('refreshes added, renamed, and deleted document routes without restarting', async () => {
    const addedFile = path.join(root, 'dynamic.mdx')
    const renamedFile = path.join(root, 'renamed.md')
    const server = await createDevServer(root, {
      host: '127.0.0.1',
      port: 0,
    })
    runningServers.push(server)

    try {
      await expect
        .poll(() => rawStatus(new URL(server.url), '/docs/dynamic'))
        .toBe(404)

      await writeFile(
        addedFile,
        '# Dynamic route\n\nAdded while dev is running.\n',
      )
      await expect
        .poll(async () => {
          const response = await fetch(new URL('dynamic', server.url))
          return { body: await response.text(), status: response.status }
        })
        .toMatchObject({
          body: expect.stringContaining('Dynamic route'),
          status: 200,
        })

      await rename(addedFile, renamedFile)
      await expect
        .poll(async () => {
          return {
            added: await rawStatus(new URL(server.url), '/docs/dynamic'),
            renamed: await rawStatus(new URL(server.url), '/docs/renamed'),
          }
        })
        .toEqual({ added: 404, renamed: 200 })

      await rm(renamedFile)
      await expect
        .poll(() => rawStatus(new URL(server.url), '/docs/renamed'))
        .toBe(404)
    } finally {
      await Promise.all([
        rm(addedFile, { force: true }),
        rm(renamedFile, { force: true }),
      ])
    }
  }, 30_000)
})

describe('preview server', () => {
  beforeAll(async () => {
    await build(root)
    await mkdir(path.join(root, 'output', '.well-known'), { recursive: true })
    await writeFile(
      path.join(root, 'output', '.well-known/security.txt'),
      'Contact: mailto:security@example.test\n',
    )
    await writeFile(
      path.join(root, 'output', '.hidden.txt'),
      'internal preview metadata\n',
    )
    await mkdir(path.join(root, 'output', '.internal'), { recursive: true })
    await writeFile(
      path.join(root, 'output', '.internal/metadata.json'),
      '{"source":"index.mdx"}\n',
    )
    await symlink(
      path.join(root, 'secret.txt'),
      path.join(root, 'output', 'leak.txt'),
    )
  }, 60_000)

  it('serves only built HTML and assets with MIME and HEAD support', async () => {
    const server = await createPreviewServer(root, {
      host: '127.0.0.1',
      port: 0,
    })
    runningServers.push(server)

    const home = await fetch(server.url)
    expect(home.status).toBe(200)
    expect(home.headers.get('content-type')).toContain('text/html')
    const html = await home.text()
    expect(html).toContain('<h1>Development home</h1>')

    const scriptPath = /<script type="module" src="([^"]+\.js)">/.exec(
      html,
    )?.[1]
    expect(scriptPath).toBeDefined()
    const scriptHead = await fetch(
      `http://127.0.0.1:${server.port}${scriptPath!}`,
      { method: 'HEAD' },
    )
    expect(scriptHead.status).toBe(200)
    expect(scriptHead.headers.get('content-type')).toContain('javascript')
    expect(Number(scriptHead.headers.get('content-length'))).toBeGreaterThan(0)
    expect(await scriptHead.text()).toBe('')

    const guide = await fetch(new URL('guide', server.url))
    expect(guide.status).toBe(200)
    expect(await guide.text()).toContain('<h1>Preview guide</h1>')
  }, 30_000)

  it('returns 404 for missing, outside-base, traversal, and escaping symlinks', async () => {
    const server = await createPreviewServer(root, {
      host: '127.0.0.1',
      port: 0,
    })
    runningServers.push(server)

    expect((await fetch(new URL('missing', server.url))).status).toBe(404)
    expect(
      (await fetch(`http://127.0.0.1:${server.port}/output/index.html`)).status,
    ).toBe(404)
    expect((await fetch(new URL('leak.txt', server.url))).status).toBe(404)
    expect(
      await rawStatus(new URL(server.url), '/docs/%2e%2e/secret.txt'),
    ).toBe(404)
    expect(await rawStatus(new URL(server.url), '/docs/%2fetc/passwd')).toBe(
      404,
    )
  })

  it('denies internal dot paths without leaking content', async () => {
    const server = await createPreviewServer(root, {
      host: '127.0.0.1',
      port: 0,
    })
    runningServers.push(server)

    for (const path of [
      '.vite/manifest.json',
      '.hidden.txt',
      '.internal/metadata.json',
      '%2einternal/metadata.json',
    ]) {
      const response = await fetch(new URL(path, server.url))
      expect(response.status).toBe(404)
      const body = await response.text()
      expect(body).toBe('Not found\n')
      expect(body).not.toContain('index.mdx')
      expect(body).not.toContain('internal preview metadata')
    }

    const wellKnown = await fetch(
      new URL('.well-known/security.txt', server.url),
    )
    expect(wellKnown.status).toBe(200)
    expect(await wellKnown.text()).toBe(
      'Contact: mailto:security@example.test\n',
    )
  })

  it('fails actionably when the resolved output directory is absent', async () => {
    const missingRoot = await mkdtemp(path.join(tmpdir(), 'silen-preview-'))
    temporaryDirectories.push(missingRoot)
    await mkdir(path.join(missingRoot, '.silen'), { recursive: true })
    await writeFile(
      path.join(missingRoot, '.silen/config.ts'),
      `export default { outDir: 'not-built' }\n`,
    )

    await expect(createPreviewServer(missingRoot, { port: 0 })).rejects.toThrow(
      'not-built',
    )
  })
})
