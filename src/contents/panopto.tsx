import type { PlasmoCSConfig } from "plasmo"

import { DEFAULT_BACKEND_URL, getSettings } from "~src/lib/storage"

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

type DownloadResult = {
  success: boolean
  message?: string
  error?: string
  lectureId?: string
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
    const [streamUrl, additionalStreams] = await requestDeliveryInfo(videoId, isTid)
    const { backendUrl, apiKey } = await getSettings()
    const resolvedBackend = backendUrl?.trim() || DEFAULT_BACKEND_URL

    const lectureResponse = await sendToBackend({
      streamUrl,
      title: document.title,
      sourceUrl: window.location.href,
      backendUrl: resolvedBackend,
      courseId,
      apiKey,
      sessionToken
    })

    if (additionalStreams?.length) {
      console.info("Additional streams detected:", additionalStreams.length)
    }

    return {
      success: true,
      message: "Video sent to Study Buddy! Download started.",
      lectureId: lectureResponse?.lecture_id
    }
  } catch (error) {
    console.error("Download error:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

const requestDeliveryInfo = async (videoId: string, isTid = false) => {
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

  const streamUrl = data.Delivery?.PodcastStreams?.[0]?.StreamUrl
  const streams = (data.Delivery?.Streams || []).filter((item) => item.StreamUrl !== streamUrl)

  if (!streamUrl) {
    throw new Error("Stream URL not available")
  }

  return [streamUrl, streams]
}

type BackendPayload = {
  streamUrl: string
  title?: string | null
  sourceUrl?: string
  backendUrl: string
  courseId: string
  apiKey?: string | null
  sessionToken?: string
}

type LectureDownloadResponse = {
  lecture_id: string
  status: string
}

const sendToBackend = async ({
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
