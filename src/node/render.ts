import type { RenderedPage } from '../client/app.js'
import { appearanceScript } from '../theme-default/appearance-script.js'
import { renderAnalyticsHead } from './analytics.js'
import type { SilenHeadEntry } from '../shared/plugin.js'

export interface AssetPreload {
  as: 'audio' | 'font' | 'image' | 'video'
  file: string
}

export interface RenderAssets {
  base: string
  clientEntry: string
  favicon?: {
    file: string
    type: string
  }
  stylesheets?: readonly string[]
  modulePreloads?: readonly string[]
  assetPreloads?: readonly AssetPreload[]
  head?: readonly SilenHeadEntry[]
  seo?: PageSeo
}

export interface SeoAlternate {
  lang: string
  url: string
}

export interface PageSeo {
  canonicalUrl: string
  alternates: readonly SeoAlternate[]
}

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

function normalizedBase(base: string): string {
  const leading = base.startsWith('/') ? base : `/${base}`
  return leading.endsWith('/') ? leading : `${leading}/`
}

function assetUrl(base: string, file: string): string {
  if (/^\/@(?:fs|id|vite)\//.test(file)) return file
  return `${normalizedBase(base)}${file.replace(/^\/+/, '')}`
}

function inlineJson(value: unknown): string {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new TypeError('Failed to serialize Silen public page data')
  }

  return JSON.stringify(json)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function inlineRawText(tag: string, value: string): string {
  return tag === 'script'
    ? value
        .replace(/<\/script/giu, '<\\/script')
        .replaceAll('\u2028', '\\u2028')
        .replaceAll('\u2029', '\\u2029')
    : value.replace(/<\/style/giu, '<\\/style')
}

function renderHeadEntry(entry: SilenHeadEntry): string {
  const attributes = Object.entries(entry.attributes ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, value]) => {
      if (value === false) return []
      return [value === true ? name : `${name}="${escapeHtml(value)}"`]
    })
  const opening = attributes.length
    ? `<${entry.tag} ${attributes.join(' ')}>`
    : `<${entry.tag}>`
  if (entry.tag === 'link' || entry.tag === 'meta') return opening
  const children = entry.children ?? ''
  const content =
    entry.tag === 'script' || entry.tag === 'style'
      ? inlineRawText(entry.tag, children)
      : escapeHtml(children)
  return `${opening}${content}</${entry.tag}>`
}

function renderSeo(page: RenderedPage, seo: PageSeo | undefined): string[] {
  if (seo === undefined) return []

  return [
    `<link rel="canonical" href="${escapeHtml(seo.canonicalUrl)}">`,
    ...seo.alternates.map(
      ({ lang, url }) =>
        `<link rel="alternate" hreflang="${escapeHtml(lang)}" href="${escapeHtml(url)}">`,
    ),
    '<meta property="og:type" content="website">',
    ...(page.title
      ? [`<meta property="og:title" content="${escapeHtml(page.title)}">`]
      : []),
    ...(page.description
      ? [
          `<meta property="og:description" content="${escapeHtml(page.description)}">`,
        ]
      : []),
    `<meta property="og:url" content="${escapeHtml(seo.canonicalUrl)}">`,
    '<meta name="twitter:card" content="summary">',
    ...(page.title
      ? [`<meta name="twitter:title" content="${escapeHtml(page.title)}">`]
      : []),
    ...(page.description
      ? [
          `<meta name="twitter:description" content="${escapeHtml(page.description)}">`,
        ]
      : []),
  ]
}

export function renderDocument(
  page: RenderedPage,
  assets: RenderAssets,
): string {
  const stylesheets = unique(assets.stylesheets ?? []).map(
    (file) =>
      `<link rel="stylesheet" href="${escapeHtml(assetUrl(assets.base, file))}">`,
  )
  const modulePreloads = unique(assets.modulePreloads ?? []).map(
    (file) =>
      `<link rel="modulepreload" href="${escapeHtml(assetUrl(assets.base, file))}">`,
  )
  const assetPreloads = unique(
    (assets.assetPreloads ?? []).map(({ as, file }) => `${as}\0${file}`),
  ).map((entry) => {
    const separator = entry.indexOf('\0')
    const as = entry.slice(0, separator)
    const file = entry.slice(separator + 1)
    return `<link rel="preload" as="${as}" href="${escapeHtml(assetUrl(assets.base, file))}">`
  })
  const faviconLinks = assets.favicon
    ? [
        `<link rel="icon" type="${escapeHtml(assets.favicon.type)}" href="${escapeHtml(assetUrl(assets.base, assets.favicon.file))}">`,
      ]
    : []
  const analytics = renderAnalyticsHead(page.publicData.analytics ?? [])
  const pluginHead = (assets.head ?? []).map(renderHeadEntry)
  const seo = renderSeo(page, assets.seo)

  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(page.publicData.lang)}">`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<script>${appearanceScript}</script>`,
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    ...faviconLinks,
    ...stylesheets,
    ...modulePreloads,
    ...assetPreloads,
    ...seo,
    ...analytics,
    ...pluginHead,
    '</head>',
    `<body><div id="app">${page.appHtml}</div>`,
    `<script>window.__SILEN__=JSON.parse(${inlineJson(page.publicData)})</script>`,
    `<script type="module" src="${escapeHtml(assetUrl(assets.base, assets.clientEntry))}"></script>`,
    '</body>',
    '</html>',
  ].join('')
}
