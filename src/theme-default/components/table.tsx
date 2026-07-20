import type { ComponentPropsWithoutRef } from 'react'
import { useThemeMessages } from '../lib/theme-config.js'

export type TableProps = ComponentPropsWithoutRef<'table'>

export function Table(props: TableProps): React.JSX.Element {
  const messages = useThemeMessages()

  return (
    <div
      aria-label={messages.table.scrollableRegion}
      className="silen-table-scroll"
      role="region"
      tabIndex={0}
    >
      <table {...props} />
    </div>
  )
}
