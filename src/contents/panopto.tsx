import type { PlasmoCSConfig } from "plasmo"

import { DEFAULT_BACKEND_URL, getSettings } from "~src/lib/storage"
import type {
  DeliveryInfo,
  HlsVariant,
  ImportResult,
  BatchImportResult,
  LectureStreamResponse,
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

const CONCURRENCY_LIMIT = 3

const sendProgressUpdate = (progress: UploadProgress) => {
  chrome.runtime.sendMessage({ action: "progressUpdate", progress }).catch(() => {
    // Popup might be closed, ignore
  })
}

/**
 * Import a single lecture
 */
const handleImportLecture = async (
  courseId: string,
  sessionToken?: string
): Promise<ImportResult> => {
  const url = new URL(window.location.href)
  const sessionId = url.searchParams.get("id") ?? url.searchParams.get("tid")

  if (!sessionId) {
    return { success: false, error: "No session ID found in URL" }
  }

  if (!courseId) {
    return { success: false, error: "Course selection is required" }
  }

  try {
    sendProgressUpdate({ phase: "extracting", percent: 0, message: "Fetching lecture info..." })

    const result = await extractAndIngest(sessionId, courseId, sessionToken)

    sendProgressUpdate({ phase: "done", percent: 100, message: "Lecture imported!" })

    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    sendProgressUpdate({ phase: "error", percent: 0, message: errorMsg })
    return { success: false, error: errorMsg }
  }
}

/**
 * Batch import multiple lectures with concurrency limit
 */
const handleBatchImport = async (
  sessionIds: string[],
  courseId: string,
  sessionToken?: string
): Promise<BatchImportResult> => {
  const results: BatchImportResult["results"] = []
  const total = sessionIds.length
  let completed = 0

  // Process in chunks with concurrency limit
  const processChunk = async (ids: string[]) => {
    const promises = ids.map(async (sessionId) => {
      try {
        const result = await extractAndIngest(sessionId, courseId, sessionToken)
        return { sessionId, success: result.success, lectureId: result.lectureId, error: result.error }
      } catch (error) {
        return { sessionId, success: false, error: error instanceof Error ? error.message : "Unknown error" }
      } finally {
        completed++
        sendProgressUpdate({
          phase: "processing",
          percent: Math.round((completed / total) * 100),
          message: `Importing lectures...`,
          current: completed,
          total
        })
      }
    })
    return Promise.all(promises)
  }

  // Split into chunks of CONCURRENCY_LIMIT
  for (let i = 0; i < sessionIds.length; i += CONCURRENCY_LIMIT) {
    const chunk = sessionIds.slice(i, i + CONCURRENCY_LIMIT)
    const chunkResults = await processChunk(chunk)
    results.push(...chunkResults)
  }

  const successCount = results.filter((r) => r.success).length
  sendProgressUpdate({
    phase: "done",
    percent: 100,
    message: `Imported ${successCount}/${total} lectures`
  })

  return { success: successCount > 0, results }
}

/**
 * Core function: extract stream URL and send to backend
 */
const extractAndIngest = async (
  sessionId: string,
  courseId: string,
  sessionToken?: string
): Promise<ImportResult> => {
  console.log("[StudyBuddy] Starting extraction for session:", sessionId)

  // Step 1: Get delivery info from Panopto
  const deliveryInfo = await fetchDeliveryInfo(sessionId)
  console.log("[StudyBuddy] Got delivery info:", deliveryInfo)

  // Step 2: Fetch and parse HLS master playlist
  const lowestVariant = await getLowestBandwidthVariant(deliveryInfo.masterPlaylistUrl)
  console.log("[StudyBuddy] Selected variant:", lowestVariant)

  // Step 3: Send to backend
  const { backendUrl, apiKey } = await getSettings()
  const resolvedBackend = backendUrl?.trim() || DEFAULT_BACKEND_URL

  const response = await ingestToBackend({
    streamUrl: lowestVariant.url,
    sessionId: deliveryInfo.sessionId,
    courseId,
    title: deliveryInfo.sessionName,
    duration: deliveryInfo.duration,
    sourceUrl: deliveryInfo.sourceUrl,
    backendUrl: resolvedBackend,
    sessionToken,
    apiKey
  })

  return {
    success: true,
    message: "Lecture sent for processing",
    lectureId: response.lecture_id
  }
}

/**
 * Fetch delivery info from Panopto API
 */
const fetchDeliveryInfo = async (sessionId: string): Promise<DeliveryInfo> => {
  const url = `${window.location.origin}/Panopto/Pages/Viewer/DeliveryInfo.aspx`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/javascript, */*; q=0.01",
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: `deliveryId=${sessionId}&isEmbed=true&responseType=json`
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch delivery info: HTTP ${response.status}`)
  }

  const data = await response.json()

  if (data.ErrorCode) {
    throw new Error(data.ErrorMessage || "Panopto API error")
  }

  // Use HLS stream URL
  const hlsUrl = data.Delivery?.Streams?.[0]?.StreamHttpUrl
  const podcastStreamUrl = data.Delivery?.PodcastStreams?.[0]?.StreamUrl

  const streamUrl = hlsUrl || podcastStreamUrl

  if (!streamUrl) {
    throw new Error("No stream URL available")
  }

  console.log("[StudyBuddy] Using stream URL:", hlsUrl ? "HLS" : "PodcastStream (MP4)", streamUrl)

  return {
    sessionId: data.SessionId || sessionId,
    sessionName: data.Delivery?.SessionName || "",
    duration: data.Delivery?.Duration || 0,
    masterPlaylistUrl: streamUrl,
    sourceUrl: window.location.href
  }
}

/**
 * Get the stream URL to send to backend.
 * If it's a direct MP4, return as-is. If HLS, parse and get lowest bandwidth variant.
 */
const getLowestBandwidthVariant = async (streamUrl: string): Promise<HlsVariant> => {
  // If it's a direct MP4 (not HLS), return as-is
  if (!streamUrl.includes(".m3u8")) {
    console.log("[StudyBuddy] Direct MP4 URL, skipping HLS parsing")
    return { bandwidth: 0, url: streamUrl }
  }

  // It's HLS - fetch and parse
  const response = await fetch(streamUrl)

  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: HTTP ${response.status}`)
  }

  const playlistText = await response.text()
  const variants = parseHlsPlaylist(playlistText, streamUrl)

  if (variants.length === 0) {
    // Not a master playlist, return the URL as-is
    return { bandwidth: 0, url: streamUrl }
  }

  // Sort by bandwidth and return lowest
  variants.sort((a, b) => a.bandwidth - b.bandwidth)
  return variants[0]
}

/**
 * Parse HLS master playlist and extract variants
 */
const parseHlsPlaylist = (playlistText: string, baseUrl: string): HlsVariant[] => {
  const variants: HlsVariant[] = []
  const lines = playlistText.split("\n")
  const baseUrlObj = new URL(baseUrl)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      // Extract bandwidth
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/)
      const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0

      // Next non-empty line should be the URL
      let urlLine = ""
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim()
        if (nextLine && !nextLine.startsWith("#")) {
          urlLine = nextLine
          break
        }
      }

      if (urlLine) {
        // Resolve relative URLs
        let variantUrl: string
        if (urlLine.startsWith("http")) {
          variantUrl = urlLine
        } else {
          // Relative URL - resolve against base
          const urlParts = baseUrlObj.pathname.split("/")
          urlParts.pop() // Remove filename
          variantUrl = `${baseUrlObj.origin}${urlParts.join("/")}/${urlLine}`
        }

        variants.push({ bandwidth, url: variantUrl })
      }
    }
  }

  return variants
}

/**
 * Send lecture data to backend via background script (avoids CORS)
 */
const ingestToBackend = (params: {
  streamUrl: string
  sessionId: string
  courseId: string
  title: string
  duration: number
  sourceUrl: string
  backendUrl: string
  sessionToken?: string
  apiKey?: string | null
}): Promise<LectureStreamResponse> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "postToBackend",
        ...params
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Background request failed"))
        } else if (response?.error) {
          reject(new Error(response.error))
        } else {
          resolve(response)
        }
      }
    )
  })
}

// Message listeners
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log("[StudyBuddy] Received message:", request?.action)

  if (request?.action === "importLecture") {
    handleImportLecture(request.courseId, request.sessionToken)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
      })
    return true
  }

  if (request?.action === "batchImport") {
    handleBatchImport(request.sessionIds, request.courseId, request.sessionToken)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, results: [], error: error instanceof Error ? error.message : "Unknown error" })
      })
    return true
  }

  // Legacy support for downloadVideo action
  if (request?.action === "downloadVideo") {
    handleImportLecture(request.courseId, request.sessionToken)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
      })
    return true
  }

  return false
})
