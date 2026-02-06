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

  // Handle backend POST request (avoids CORS from content script)
  if (message?.action === "postToBackend") {
    postToBackend(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ error: error instanceof Error ? error.message : "Unknown error" })
      })
    return true // Keep channel open for async response
  }

  return false
})

/**
 * POST to backend from background script (no CORS restrictions)
 */
async function postToBackend(params: {
  streamUrl: string
  sessionId: string
  courseId: string
  title: string
  duration: number
  sourceUrl: string
  backendUrl: string
  sessionToken?: string
  apiKey?: string | null
}) {
  const { streamUrl, sessionId, courseId, title, duration, sourceUrl, backendUrl, sessionToken, apiKey } = params

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const payload = {
    streamUrl,
    sessionId,
    courseId,
    title,
    sourceUrl,
    duration
  }

  console.log("[StudyBuddy] Posting to backend:", backendUrl, payload)

  const response = await fetch(`${backendUrl}/api/lectures/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  })

  console.log("[StudyBuddy] Backend response:", response.status, response.statusText)

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[StudyBuddy] Backend error:", errorText)
    let errorDetail = "Unknown error"
    try {
      const errorJson = JSON.parse(errorText)
      errorDetail = errorJson.detail || errorJson.message || `HTTP ${response.status}`
    } catch {
      errorDetail = errorText || `HTTP ${response.status}`
    }
    throw new Error(errorDetail)
  }

  return response.json()
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})
