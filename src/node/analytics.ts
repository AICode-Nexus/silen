import type { AnalyticsProvider, AnalyticsScript } from '../shared/config.js'

const htmlEscapes: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character]!)
}

function inlineJavaScript(value: string): string {
  return value
    .replace(/<\/script/giu, '<\\/script')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function javascriptString(value: string): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function scriptTag(script: AnalyticsScript): string {
  const attributes: string[] = []
  if (script.src !== undefined) {
    attributes.push(`src="${escapeHtml(script.src)}"`)
  }
  if (script.async) attributes.push('async')
  if (script.defer) attributes.push('defer')
  for (const [name, value] of Object.entries(script.attributes ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (value === false) continue
    attributes.push(value === true ? name : `${name}="${escapeHtml(value)}"`)
  }
  const opening = attributes.length
    ? `<script ${attributes.join(' ')}>`
    : '<script>'
  return `${opening}${inlineJavaScript(script.content ?? '')}</script>`
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

export function renderAnalyticsHead(
  analytics: readonly AnalyticsProvider[],
): string[] {
  const providers = analytics.filter((provider) => provider.enabled !== false)
  const googleIds = unique(
    providers
      .filter((provider) => provider.provider === 'google')
      .map((provider) => provider.id),
  )
  const baiduIds = unique(
    providers
      .filter((provider) => provider.provider === 'baidu')
      .map((provider) => provider.id),
  )
  const tags: string[] = []

  if (googleIds.length > 0) {
    const setup = [
      'window.dataLayer=window.dataLayer||[];',
      'window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};',
      "window.gtag('js',new Date());",
      ...googleIds.map(
        (id) =>
          `window.gtag('config',${javascriptString(id)},{send_page_view:false});`,
      ),
    ].join('')
    tags.push(scriptTag({ content: setup }))
    tags.push(
      scriptTag({
        src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleIds[0]!)}`,
        async: true,
      }),
    )
  }

  if (baiduIds.length > 0) {
    tags.push(
      scriptTag({
        content:
          "window._hmt=window._hmt||[];window._hmt.push(['_setAutoPageview',false]);",
      }),
    )
    tags.push(
      ...baiduIds.map((id) =>
        scriptTag({
          src: `https://hm.baidu.com/hm.js?${encodeURIComponent(id)}`,
          async: true,
        }),
      ),
    )
  }

  for (const provider of providers) {
    if (provider.provider !== 'custom') continue
    tags.push(...provider.scripts.map(scriptTag))
  }

  return unique(tags)
}
