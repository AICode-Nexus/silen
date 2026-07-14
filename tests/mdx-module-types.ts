import type { ComponentType } from 'react'
import Page, { frontmatter, headings, links } from './fixtures/mdx/page.mdx'
import type { Heading } from '../src/shared/page.js'

const component: ComponentType = Page
const metadata: Readonly<Record<string, unknown>> = frontmatter
const pageHeadings: readonly Heading[] = headings
const pageLinks: readonly string[] = links

void component
void metadata
void pageHeadings
void pageLinks
