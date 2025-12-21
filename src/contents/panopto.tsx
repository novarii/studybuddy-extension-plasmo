import type { PlasmoCSConfig } from "plasmo"

import { DEFAULT_BACKEND_URL, getSettings } from "~src/lib/storage"
import type {
  BackendPayload,
  DeliveryInfo,
  DownloadResult,
  FetchAndUploadAudioResponse,
  LectureDownloadResponse,
  LectureMetadata,
  UploadProgress
} from "~src/lib/types"

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.panopto.com/Panopto/Pages/Viewer.aspx*",
    "https://*.panopto.eu/Panopto/Pages/Viewer.aspx*",
    "https://*.panopto.com/Panopto/Pages/Embed.aspx*",
    "https://*.panopto.eu/Panopto/Pages/Embed.aspx*",
    "https://*.panopto.com/Panopto/Pages/Sessions/List.aspx*",
    "https://*.panopto.eu/Panopto/Pages/Sessions/List.aspx*"
  ],
  run_at: "document_idle"
}

const sendProgressUpdate = (progress: UploadProgress) => {
  // Send to popup via runtime message
  chrome.runtime.sendMessage({ action: "progressUpdate", progress }).catch(() => {
    // Popup might be closed, ignore
  })
}

const handleSingleDownload = async (
  courseId: string,
  sessionToken?: string
): Promise<DownloadResult> => {
  const url = new URL(window.location.href)
  const videoId = url.searchParams.get("id") ?? url.searchParams.get("tid")
  const isTid = url.searchParams.has("tid")

  if (!videoId) {
    return { success: false, error: "Failed to get Lesson ID." }
  }

  if (!courseId) {
    return { success: false, error: "Course selection is required." }
  }

  try {
    sendProgressUpdate({
      phase: "processing",
      percent: 0,
      message: "Fetching lecture info..."
    })

    const deliveryInfo = await requestDeliveryInfo(videoId, isTid)
    const { backendUrl, apiKey } = await getSettings()
    const resolvedBackend = backendUrl?.trim() || DEFAULT_BACKEND_URL

    // Check if audio podcast is available
    if (deliveryInfo.isAudioPodcastReady) {
      // Primary path: fetch and upload via background script
      console.info("[StudyBuddy] Attempting primary path: direct audio upload")

      sendProgressUpdate({
        phase: "downloading",
        percent: 0,
        message: "Downloading audio...",
        method: "primary"
      })

      const metadata: LectureMetadata = {
        session_id: deliveryInfo.sessionId,
        course_id: courseId,
        title: deliveryInfo.sessionName || document.title,
        duration: deliveryInfo.duration,
        source_url: deliveryInfo.sourceUrl
      }

      const audioPodcastUrl = `${window.location.origin}/Panopto/Podcast/Download/${deliveryInfo.publicId}.mp4?mediaTargetType=audioPodcast`

      const result = await fetchAndUploadViaBackground({
        audioPodcastUrl,
        metadata,
        backendUrl: resolvedBackend,
        sessionToken,
        apiKey
      })

      if (result.success) {
        sendProgressUpdate({
          phase: "done",
          percent: 100,
          message: "Upload complete!",
          method: "primary"
        })

        return {
          success: true,
          message: "Audio uploaded directly to Study Buddy!",
          lectureId: result.lectureId,
          method: "primary"
        }
      }

      // If primary path failed, fall through to fallback
      console.warn("[StudyBuddy] Primary path failed:", result.error)
    }

    // Fallback path: send URL for backend processing
    console.info("[StudyBuddy] Using fallback path: server-side processing")

    sendProgressUpdate({
      phase: "processing",
      percent: 50,
      message: "Using server-side processing...",
      method: "fallback"
    })

    const lectureResponse = await sendToBackendFallback({
      streamUrl: deliveryInfo.fallbackStreamUrl!,
      title: deliveryInfo.sessionName || document.title,
      sourceUrl: deliveryInfo.sourceUrl,
      backendUrl: resolvedBackend,
      courseId,
      apiKey,
      sessionToken
    })

    sendProgressUpdate({
      phase: "done",
      percent: 100,
      message: "Request sent to server!",
      method: "fallback"
    })

    return {
      success: true,
      message: "Video sent for server-side processing.",
      lectureId: lectureResponse?.lecture_id,
      method: "fallback"
    }
  } catch (error) {
    console.error("[StudyBuddy] Download error:", error)

    sendProgressUpdate({
      phase: "error",
      percent: 0,
      message: error instanceof Error ? error.message : "Unknown error"
    })

    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Fetches delivery info from Panopto API and extracts relevant fields
 */
const requestDeliveryInfo = async (videoId: string, isTid = false): Promise<DeliveryInfo> => {
  const url = `${window.location.origin}/Panopto/Pages/Viewer/DeliveryInfo.aspx`

  const body = isTid
    ? `&tid=${videoId}&isLiveNotes=false&refreshAuthCookie=true&isActiveBroadcast=false&isEditing=false&isKollectiveAgentInstalled=false&isEmbed=false&responseType=json`
    : `deliveryId=${videoId}&isEmbed=true&responseType=json`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()

  if (data.ErrorCode) {
    throw new Error(data.ErrorMessage || "Unknown error from Panopto API")
  }

  // Extract the stream URL for fallback
  const streamUrl = data.Delivery?.PodcastStreams?.[0]?.StreamUrl
  const fallbackStreamUrl =
    streamUrl ||
    data.Delivery?.Streams?.[0]?.StreamHttpUrl ||
    data.Delivery?.Streams?.[0]?.Variants?.[0]?.Url ||
    null

  if (!fallbackStreamUrl) {
    throw new Error("No stream URL available")
  }

  return {
    publicId: data.Delivery?.PublicID || videoId,
    sessionId: data.SessionId || videoId,
    sessionName: data.Delivery?.SessionName || "",
    duration: data.Delivery?.Duration || 0,
    isAudioPodcastReady: data.Delivery?.IsAudioPodcastEncodeComplete === true,
    fallbackStreamUrl,
    sourceUrl: window.location.href
  }
}

/**
 * Sends message to background script to fetch audio and upload to backend
 * This bypasses CORS and avoids large data transfers between contexts
 */
const fetchAndUploadViaBackground = (params: {
  audioPodcastUrl: string
  metadata: LectureMetadata
  backendUrl: string
  sessionToken?: string
  apiKey?: string | null
}): Promise<FetchAndUploadAudioResponse> => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "fetchAndUploadAudio",
        ...params
      },
      (response: FetchAndUploadAudioResponse) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message || "Background operation failed"
          })
        } else {
          resolve(response || { success: false, error: "No response from background" })
        }
      }
    )
  })
}

/**
 * Sends stream URL to backend for server-side processing (fallback path)
 */
const sendToBackendFallback = async ({
  streamUrl,
  title,
  sourceUrl,
  backendUrl,
  courseId,
  apiKey,
  sessionToken
}: BackendPayload): Promise<LectureDownloadResponse | null> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(`${backendUrl}/api/lectures/download`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      course_id: courseId,
      panopto_url: sourceUrl ?? window.location.href ?? streamUrl,
      stream_url: streamUrl,
      title: title ?? document.title ?? null
    })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return (await response.json().catch(() => null)) as LectureDownloadResponse | null
}

/**
 * Formats bytes to human readable string
 */
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Listen for progress updates from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === "backgroundProgress" && message.progress) {
    sendProgressUpdate(message.progress)
  }
})

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action === "downloadVideo") {
    handleSingleDownload(request.courseId, request.sessionToken)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        })
      })
    return true
  }

  return false
})
