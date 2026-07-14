import type { AskAiDialogLoader } from 'virtual:silen/ask-ai'

export const loadAskAiDialog: AskAiDialogLoader = () =>
  import('../../../src/theme-default/components/ask-ai').then((module) => ({
    default: module.EndpointAskAiDialog,
  }))
