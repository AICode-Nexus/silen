import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

const installedChromium = path.join(
  homedir(),
  'Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell',
)

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  use: {
    headless: true,
    ...(existsSync(installedChromium)
      ? { launchOptions: { executablePath: installedChromium } }
      : {}),
  },
})
