/** @internal Force a browser document navigation without leaking recovery errors. */
export function navigateDocument(href: string): void {
  try {
    window.location.assign(href)
  } catch (error) {
    // Some embedded browser hosts can reject navigation synchronously.
    void error
  }
}
