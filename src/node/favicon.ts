import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface ResolvedFavicon {
  file: string
  type: string
  source: 'default' | 'public'
}

const faviconCandidates = [
  { file: 'favicon.svg', type: 'image/svg+xml' },
  { file: 'favicon.ico', type: 'image/x-icon' },
  { file: 'favicon.png', type: 'image/png' },
] as const

export const defaultFavicon = faviconCandidates[0]

export const defaultFaviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="Silen">
  <defs>
    <linearGradient id="silen-favicon-gradient" x1="24" y1="20" x2="138" y2="142" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="42" fill="#0b1020"/>
  <path d="M118 45c-9-11-22-17-39-17-23 0-39 12-39 30 0 16 11 24 35 29l10 2c10 2 15 6 15 12 0 8-8 13-20 13-15 0-27-6-37-18l-18 17c13 16 31 24 54 24 28 0 47-14 47-36 0-18-12-28-38-33l-10-2c-8-2-12-5-12-10 0-6 6-10 15-10 11 0 20 4 28 13l19-14z" fill="url(#silen-favicon-gradient)"/>
</svg>
`

async function findPublicFavicon(
  directory: string,
): Promise<ResolvedFavicon | undefined> {
  for (const candidate of faviconCandidates) {
    try {
      const metadata = await stat(path.join(directory, candidate.file))
      if (metadata.isFile()) {
        return { ...candidate, source: 'public' }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
    }
  }
  return undefined
}

export async function resolveSourceFavicon(
  root: string,
): Promise<ResolvedFavicon> {
  return (
    (await findPublicFavicon(path.join(root, 'public'))) ?? {
      ...defaultFavicon,
      source: 'default',
    }
  )
}

export async function ensureBuildFavicon(
  outDir: string,
): Promise<ResolvedFavicon> {
  const existing = await findPublicFavicon(outDir)
  if (existing) return existing

  await writeFile(path.join(outDir, defaultFavicon.file), defaultFaviconSvg)
  return { ...defaultFavicon, source: 'default' }
}
