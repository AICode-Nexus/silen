export default {
  title: 'Ask AI disabled',
  themeConfig: {
    search: false,
    ai: {
      apiKey: 'do-not-bundle-disabled-ai-key',
      headers: { Authorization: 'do-not-bundle-disabled-ai-header' },
      provider: 'do-not-bundle-disabled-ai-provider',
    },
  },
}
