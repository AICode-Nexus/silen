import type { RenderedPage } from '../client/app.js'
import { appearanceScript } from '../theme-default/appearance-script.js'

export interface AssetPreload {
  as: 'audio' | 'font' | 'image' | 'video'
  file: string
}

export interface RenderAssets {
  base: string
  clientEntry: string
  stylesheets?: readonly string[]
  modulePreloads?: readonly string[]
  assetPreloads?: readonly AssetPreload[]
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
    ...stylesheets,
    ...modulePreloads,
    ...assetPreloads,
    '</head>',
    `<body><div id="app">${page.appHtml}</div>`,
    `<script>window.__SILEN__=JSON.parse(${inlineJson(page.publicData)})</script>`,
    `<script type="module" src="${escapeHtml(assetUrl(assets.base, assets.clientEntry))}"></script>`,
    '</body>',
    '</html>',
  ].join('')
}
