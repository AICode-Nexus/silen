import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, definePlugin } from '../../../../src/index'
import type { Plugin } from 'vite'

interface TextNode {
  type: string
  value?: string
  children?: TextNode[]
}

function remarkFixture() {
  return (tree: TextNode): void => {
    const transform = (node: TextNode): void => {
      if (node.type === 'text' && node.value === 'PLUGIN_TOKEN') {
        node.value = 'MDX plugin active'
      }
      for (const child of node.children ?? []) transform(child)
    }
    transform(tree)
  }
}

const fixturePlugin = definePlugin(
  (_context, options: { readonly label: string }) => {
    let pageTransforms = 0
    return {
      name: 'fixture-plugin',
      config() {
        return { description: 'Configured by plugin' }
      },
      extendMdx() {
        return { remarkPlugins: [remarkFixture] }
      },
      vite() {
        const plugin: Plugin = {
          name: 'fixture-plugin:vite',
          generateBundle() {
            this.emitFile({
              type: 'asset',
              fileName: 'plugin-vite.txt',
              source: options.label,
            })
          },
        }
        return plugin
      },
      clientModules() {
        return './.silen/client.tsx'
      },
      transformPageData(page) {
        pageTransforms += 1
        return {
          title: 'Transformed plugin page',
          description: 'Transformed plugin description',
          data: { ...page.data, fixtureLabel: options.label },
        }
      },
      transformHead() {
        return [
          {
            tag: 'meta',
            attributes: { name: 'plugin-fixture', content: options.label },
          },
        ]
      },
      async buildEnd({ outDir, routes, pages }) {
        await writeFile(
          path.join(outDir, 'plugin-build-end.json'),
          JSON.stringify({
            label: options.label,
            routes: routes.length,
            pageTransforms,
            pageKeys: Object.keys(pages[0] ?? {}).sort(),
          }),
          'utf8',
        )
        if (process.env.SILEN_FIXTURE_BUILD_END_FAILURE === '1') {
          throw new Error('fixture post-build failed')
        }
      },
    }
  },
)

export default defineConfig({
  title: 'Plugin fixture',
  plugins: [[fixturePlugin, { label: 'community-ready' }]],
})
