import { Link, useData } from '../../client/index.js'
import { resolveThemeLink } from '../lib/navigation.js'
import { useThemeMessages } from '../lib/theme-config.js'
import { Button } from './ui/button.js'

export function NotFound(): React.JSX.Element {
  const { base } = useData()
  const messages = useThemeMessages()
  return (
    <section className="flex min-h-[50svh] flex-col items-start justify-center gap-5">
      <h1>404</h1>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">{messages.notFound.title}</h2>
        <p className="text-muted-foreground">{messages.notFound.description}</p>
      </div>
      <Button asChild>
        <Link href={resolveThemeLink('/', base)}>
          {messages.notFound.returnHome}
        </Link>
      </Button>
    </section>
  )
}
