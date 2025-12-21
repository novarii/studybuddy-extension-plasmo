import { DEFAULT_BACKEND_URL } from "~src/lib/storage"
import type {
  FetchAndUploadAudioMessage,
  FetchAndUploadAudioResponse,
  LectureAudioResponse
} from "~src/lib/types"

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  // Handle combined fetch + upload (bypasses CORS and avoids large data transfer)
  if (message?.action === "fetchAndUploadAudio") {
    const msg = message as FetchAndUploadAudioMessage
    fetchAndUploadAudio(msg, sender.tab?.id)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        } as FetchAndUploadAudioResponse)
      })
    return true // Keep channel open for async response
  }

  return false
})

/**
 * Send progress update to content script
 */
function sendProgressToTab(
  tabId: number | undefined,
  phase: string,
  percent: number,
  message: string
) {
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      action: "backgroundProgress",
      progress: { phase, percent, message, method: "primary" }
    }).catch(() => {
      // Tab might be closed, ignore
    })
  }
}

/**
 * Fetches audio from Panopto and uploads directly to backend
 * This runs entirely in background script context to bypass CORS
 */
async function fetchAndUploadAudio(
  message: FetchAndUploadAudioMessage,
  tabId?: number
): Promise<FetchAndUploadAudioResponse> {
  const { audioPodcastUrl, metadata, backendUrl, sessionToken, apiKey } = message

  try {
    // Step 1: Fetch audio from Panopto
    sendProgressToTab(tabId, "downloading", 0, "Downloading audio...")

    const fetchResponse = await fetch(audioPodcastUrl, {
      credentials: "include"
    })

    if (!fetchResponse.ok) {
      return {
        success: false,
        error: `Failed to fetch audio: HTTP ${fetchResponse.status}`
      }
    }

    const contentType = fetchResponse.headers.get("content-type") || ""

    // Check if we got HTML (login redirect) instead of audio
    if (contentType.includes("text/html")) {
      return {
        success: false,
        error: "Received HTML instead of audio (possible login redirect)"
      }
    }

    // Check for valid audio/video content type
    if (!contentType.includes("video/mp4") && !contentType.includes("audio/")) {
      return {
        success: false,
        error: `Unexpected content type: ${contentType}`
      }
    }

    sendProgressToTab(tabId, "downloading", 50, "Processing audio...")

    const audioBlob = await fetchResponse.blob()

    sendProgressToTab(
      tabId,
      "downloading",
      100,
      `Audio downloaded (${formatBytes(audioBlob.size)})`
    )

    // Step 2: Upload to backend
    sendProgressToTab(tabId, "uploading", 0, "Uploading to Study Buddy...")

    const formData = new FormData()
    formData.append("audio", audioBlob, `${metadata.session_id}.m4a`)
    formData.append("metadata", JSON.stringify(metadata))

    const headers: Record<string, string> = {}
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`
    } else if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    const uploadResponse = await fetch(`${backendUrl}/api/lectures/audio`, {
      method: "POST",
      headers,
      body: formData
    })

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.json().catch(() => ({ detail: "Unknown error" }))
      return {
        success: false,
        error: errorBody.detail || `Upload failed: HTTP ${uploadResponse.status}`
      }
    }

    const result = (await uploadResponse.json()) as LectureAudioResponse

    sendProgressToTab(tabId, "done", 100, "Upload complete!")

    return {
      success: true,
      lectureId: result.lecture_id
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }
  }
}

/**
 * Formats bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})
