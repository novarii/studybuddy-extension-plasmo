// Panopto Delivery Info types
export interface DeliveryInfo {
  publicId: string
  sessionId: string
  sessionName: string
  duration: number
  isAudioPodcastReady: boolean
  fallbackStreamUrl: string | null
  sourceUrl: string
}

// Upload progress tracking
export interface UploadProgress {
  phase: "idle" | "downloading" | "uploading" | "processing" | "done" | "error"
  percent: number
  message: string
  method?: "primary" | "fallback"
}

// Message types for content script <-> popup communication
export interface DownloadVideoMessage {
  action: "downloadVideo"
  courseId: string
  sessionToken?: string
}

export interface ProgressUpdateMessage {
  action: "progressUpdate"
  progress: UploadProgress
}

export type ContentScriptMessage = DownloadVideoMessage | ProgressUpdateMessage

// Response types
export interface DownloadResult {
  success: boolean
  message?: string
  error?: string
  lectureId?: string
  method?: "primary" | "fallback"
}

export interface LectureDownloadResponse {
  lecture_id: string
  status: string
}

export interface LectureAudioResponse {
  lecture_id: string
  status: string
}

// Background script message types
export interface FetchAndUploadAudioMessage {
  action: "fetchAndUploadAudio"
  audioPodcastUrl: string
  metadata: LectureMetadata
  backendUrl: string
  sessionToken?: string
  apiKey?: string | null
}

export interface FetchAndUploadAudioResponse {
  success: boolean
  lectureId?: string
  error?: string
}

// Backend payload types
export interface BackendPayload {
  streamUrl: string
  title?: string | null
  sourceUrl?: string
  backendUrl: string
  courseId: string
  apiKey?: string | null
  sessionToken?: string
}

export interface LectureMetadata {
  session_id: string
  course_id: string
  title: string
  duration: number
  source_url: string
}
