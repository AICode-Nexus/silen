import { hydrateRoot, type Root } from 'react-dom/client'
import { App, resolveRoute } from './app.js'
import { navigateDocument } from './navigation.js'

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export async function hydrate(container?: HTMLElement): Promise<Root> {
  const app = container ?? document.getElementById('app')
  if (!app) throw new Error('Unable to hydrate Silen: #app was not found')

  const initialUrl = currentPath()
  const match = await resolveRoute(initialUrl)
  return hydrateRoot(
    app,
    <App initialUrl={initialUrl} initialPage={match.page} />,
  )
}

const app =
  typeof document === 'undefined' ? undefined : document.getElementById('app')
if (app) {
  void hydrate(app).catch(() => navigateDocument(window.location.href))
}
