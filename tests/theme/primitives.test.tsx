import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchIcon } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../../src/theme-default/components/ui/alert'
import { Badge } from '../../src/theme-default/components/ui/badge'
import { Button } from '../../src/theme-default/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../src/theme-default/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../src/theme-default/components/ui/collapsible'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../src/theme-default/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../src/theme-default/components/ui/dialog'
import { ScrollArea } from '../../src/theme-default/components/ui/scroll-area'
import { Separator } from '../../src/theme-default/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../../src/theme-default/components/ui/sheet'
import { Skeleton } from '../../src/theme-default/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../src/theme-default/components/ui/tooltip'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'scrollIntoView',
)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (originalScrollIntoView === undefined) {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  } else {
    Object.defineProperty(
      Element.prototype,
      'scrollIntoView',
      originalScrollIntoView,
    )
  }
})

describe('default theme primitives', () => {
  it('exposes stable data slots across non-overlay primitives', () => {
    const { container } = render(
      <main>
        <Button>
          <SearchIcon data-icon="inline-start" />
          Search
        </Button>
        <Badge>Alpha</Badge>
        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Default theme</CardDescription>
          </CardHeader>
          <CardContent>Content</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Accessible feedback</AlertDescription>
        </Alert>
        <Separator />
        <Skeleton aria-label="Loading navigation" />
        <ScrollArea style={{ height: 40 }}>Scrollable content</ScrollArea>
      </main>,
    )

    for (const slot of [
      'button',
      'badge',
      'card',
      'card-header',
      'card-title',
      'card-description',
      'card-content',
      'card-footer',
      'alert',
      'alert-title',
      'alert-description',
      'separator',
      'skeleton',
      'scroll-area',
    ]) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull()
    }

    expect(
      screen
        .getByRole('button', { name: 'Search' })
        .contains(container.querySelector('[data-icon="inline-start"]')),
    ).toBe(true)
  })

  it('names and describes a dialog, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup()

    render(
      <Dialog>
        <DialogTrigger>Open preferences</DialogTrigger>
        <DialogContent>
          <DialogTitle>Theme preferences</DialogTitle>
          <DialogDescription>
            Choose how documentation is displayed.
          </DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    const trigger = screen.getByRole('button', { name: 'Open preferences' })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Theme preferences' })
    expect(dialog.getAttribute('aria-describedby')).toBe(
      screen.getByText('Choose how documentation is displayed.').id,
    )
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('names and describes a sheet, closes on Escape, and restores focus', async () => {
    const user = userEvent.setup()

    render(
      <Sheet>
        <SheetTrigger>Menu</SheetTrigger>
        <SheetContent>
          <SheetTitle>Documentation navigation</SheetTitle>
          <SheetDescription>
            Browse every documentation section.
          </SheetDescription>
        </SheetContent>
      </Sheet>,
    )

    const trigger = screen.getByRole('button', { name: 'Menu' })
    await user.click(trigger)

    const sheet = screen.getByRole('dialog', {
      name: 'Documentation navigation',
    })
    expect(sheet.getAttribute('aria-describedby')).toBe(
      screen.getByText('Browse every documentation section.').id,
    )

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('selects grouped command items with the keyboard', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <Command label="Search documentation">
        <CommandInput />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Documentation">
            <CommandItem value="guides" onSelect={onSelect}>
              Guides
            </CommandItem>
            <CommandItem value="api" onSelect={onSelect}>
              API
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    )

    const input = screen.getByRole('combobox', {
      name: 'Search documentation',
    })
    await user.click(input)
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith('api')
    expect(
      screen.getByRole('option', { name: 'API' }).getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      screen
        .getByRole('group', { name: 'Documentation' })
        .contains(screen.getByRole('option', { name: 'Guides' })),
    ).toBe(true)
  })

  it('keeps the command dialog title and description inside the dialog', () => {
    render(
      <CommandDialog open>
        <Command>
          <CommandList>
            <CommandGroup heading="Documentation">
              <CommandItem>Guides</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Command Palette' })
    const description = screen.getByText('Search for a command to run...')

    expect(dialog.contains(screen.getByText('Command Palette'))).toBe(true)
    expect(dialog.contains(description)).toBe(true)
    expect(dialog.getAttribute('aria-describedby')).toBe(description.id)
  })

  it('shows a provided tooltip on focus and dismisses it with Escape', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Theme help</TooltipTrigger>
          <TooltipContent>Change the color scheme</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )

    await user.tab()
    expect(
      await screen.findByRole('tooltip', { name: 'Change the color scheme' }),
    ).not.toBeNull()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })

  it('uses the collapsible trigger as a keyboard disclosure control', async () => {
    const user = userEvent.setup()

    render(
      <Collapsible>
        <CollapsibleTrigger>Advanced options</CollapsibleTrigger>
        <CollapsibleContent>Experimental settings</CollapsibleContent>
      </Collapsible>,
    )

    const trigger = screen.getByRole('button', { name: 'Advanced options' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    trigger.focus()
    await user.keyboard('{Enter}')

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Experimental settings')).not.toBeNull()
  })
})
