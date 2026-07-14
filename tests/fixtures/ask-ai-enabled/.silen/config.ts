export default {
  title: 'Ask AI enabled',
  themeConfig: {
    search: false,
    ai: Object.assign(
      { endpoint: '/api/ask' },
      {
        apiKey: 'do-not-bundle-ask-ai-key',
        headers: { Authorization: 'do-not-bundle-ask-ai-header' },
        provider: 'do-not-bundle-ask-ai-provider',
      },
    ),
  },
}
