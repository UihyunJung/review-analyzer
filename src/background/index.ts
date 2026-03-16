import { handleAnalyzePlace } from './handlers/analyze'
import { handleGetUsage } from './handlers/usage'

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.type) {
    case 'ANALYZE_PLACE':
      handleAnalyzePlace(request, sendResponse)
      return true // async response

    case 'GET_USAGE':
      handleGetUsage(sendResponse)
      return true

    default:
      sendResponse({ success: false, error: `Unknown message type: ${request.type}` })
      return false
  }
})

chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line no-console
  console.log('[Place Review Analyzer] Extension installed')
})

export {}
