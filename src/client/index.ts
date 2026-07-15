export {
  DataProvider,
  useData,
  type DataProviderProps,
  type PagePublicData,
} from './data.js'
export {
  Link,
  RouterProvider,
  useRoute,
  useRouter,
  type LinkProps,
  type Router,
  type RouterProviderProps,
} from './router.js'
export {
  createEndpointAskAiAdapter,
  type AskAiAdapter,
  type AskAiEvent,
  type AskAiMessage,
  type AskAiRequest,
  type EndpointAskAiAdapterOptions,
} from './ai.js'
export {
  SILEN_PAGEVIEW_EVENT,
  analyticsPagePath,
  trackAnalyticsPageview,
  type AnalyticsPageviewDetail,
} from './analytics.js'
export type {
  SilenClientContext,
  SilenClientExtension,
} from '../shared/plugin.js'
