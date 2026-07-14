import { renderToString } from 'react-dom/server'
import { App, resolveRoute, type RenderedPage } from './app.js'

export async function render(url: string): Promise<RenderedPage> {
  const match = await resolveRoute(url)
  const appHtml = renderToString(
    <App initialUrl={url} initialPage={match.page} />,
  )

  return {
    appHtml,
    status: match.found ? 200 : 404,
    title: match.page.title,
    description: match.page.description,
    publicData: match.page.publicData,
  }
}

export type { RenderedPage } from './app.js'
