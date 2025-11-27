import { DEFAULT_BACKEND_URL } from "~src/lib/storage"

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install") {
    return
  }

  const existing = await chrome.storage.sync.get(["backendUrl"])
  if (!existing.backendUrl) {
    await chrome.storage.sync.set({
      backendUrl: DEFAULT_BACKEND_URL
    })
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "showNotification" && typeof message.message === "string") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "assets/icon48.png",
      title: "Study Buddy",
      message: message.message
    })
    sendResponse({ success: true })
    return true
  }
  return false
})

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})
