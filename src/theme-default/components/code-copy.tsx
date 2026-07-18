import { useEffect, useRef, type ComponentProps } from 'react'
import { useThemeMessages } from '../lib/theme-config.js'

const resetDelay = 2_000
const resetTimers = new Map<HTMLButtonElement, number>()
let subscribers = 0
let listeningDocument: Document | undefined

function setCopyState(
  button: HTMLButtonElement,
  state: 'idle' | 'success' | 'failure',
): void {
  const previous = resetTimers.get(button)
  if (previous !== undefined) window.clearTimeout(previous)
  resetTimers.delete(button)

  const label =
    state === 'success'
      ? button.dataset.copySuccessLabel
      : state === 'failure'
        ? button.dataset.copyFailureLabel
        : button.dataset.copyLabel
  button.dataset.copyState = state
  if (label) button.setAttribute('aria-label', label)
  button.textContent =
    state === 'success'
      ? (button.dataset.copiedText ?? '')
      : state === 'failure'
        ? (button.dataset.copyFailureLabel ?? '')
        : (button.dataset.copyText ?? '')

  if (state !== 'idle') {
    resetTimers.set(
      button,
      window.setTimeout(() => setCopyState(button, 'idle'), resetDelay),
    )
  }
}

async function copyCode(button: HTMLButtonElement): Promise<void> {
  const block = button.closest<HTMLElement>('[data-silen-code-block]')
  const code = block?.querySelector('code')?.textContent
  if (code === undefined) {
    setCopyState(button, 'failure')
    return
  }

  try {
    const clipboard = navigator.clipboard
    if (!clipboard) throw new Error('Clipboard access is unavailable')
    await clipboard.writeText(code)
    if (button.isConnected) setCopyState(button, 'success')
  } catch {
    if (button.isConnected) setCopyState(button, 'failure')
  }
}

function handleCopyClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return
  const button = event.target.closest<HTMLButtonElement>(
    'button[data-silen-copy]',
  )
  if (!button || button.disabled) return
  void copyCode(button)
}

function subscribeToCodeCopy(): () => void {
  subscribers += 1
  if (subscribers === 1) {
    listeningDocument = document
    listeningDocument.addEventListener('click', handleCopyClick)
  }

  return () => {
    subscribers -= 1
    if (subscribers !== 0) return
    listeningDocument?.removeEventListener('click', handleCopyClick)
    listeningDocument = undefined
    for (const timer of resetTimers.values()) window.clearTimeout(timer)
    resetTimers.clear()
  }
}

export interface CodeBlockProps extends ComponentProps<'pre'> {
  readonly code?: string
  readonly language?: string
  readonly 'data-language'?: string
}

export function CodeBlock({
  children,
  code,
  language,
  'data-language': dataLanguage,
  ...props
}: CodeBlockProps): React.JSX.Element {
  const messages = useThemeMessages()
  const copyButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const button = copyButton.current
    const handleButtonClick = (event: MouseEvent): void => {
      if (!button) return
      event.stopPropagation()
      void copyCode(button)
    }
    button?.setAttribute('data-silen-copy-ready', '')
    button?.addEventListener('click', handleButtonClick)
    const unsubscribe = subscribeToCodeCopy()
    return () => {
      button?.removeAttribute('data-silen-copy-ready')
      button?.removeEventListener('click', handleButtonClick)
      unsubscribe()
    }
  }, [])
  const sourceLanguage = language ?? dataLanguage

  return (
    <div className="silen-code-block" data-silen-code-block="">
      <div className="silen-code-toolbar">
        {sourceLanguage ? (
          <span className="silen-code-language">{sourceLanguage}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          ref={copyButton}
          type="button"
          className="silen-code-copy"
          data-silen-copy=""
          data-copy-state="idle"
          data-copy-label={messages.copy.copyCode}
          data-copy-success-label={messages.copy.codeCopied}
          data-copy-failure-label={messages.copy.copyFailed}
          data-copy-text={messages.copy.copy}
          data-copied-text={messages.copy.copied}
          aria-label={messages.copy.copyCode}
          aria-live="polite"
        >
          {messages.copy.copy}
        </button>
      </div>
      <pre {...props} data-language={sourceLanguage}>
        {code === undefined ? children : <code>{code}</code>}
      </pre>
    </div>
  )
}
