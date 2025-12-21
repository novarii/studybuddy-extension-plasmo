# Audio Ingestion Feature

## Overview

This feature implements a dual-path audio ingestion system that prioritizes direct audio downloads from Panopto's audioPodcast endpoint, with automatic fallback to the legacy video-based processing.

## Problem Statement

**Before:** Extension sent CloudFront HLS URL to backend, which:
- Downloaded full video stream (~500MB)
- Used ffmpeg to extract audio
- High bandwidth, slow processing, expensive

**After:** Extension fetches audio directly (~75MB) and uploads to backend:
- No ffmpeg needed on server
- 6-7x smaller download
- Faster processing

## Implementation

### Primary Path (Direct Audio Upload)

```
1. Content script gets DeliveryInfo from Panopto
2. Check IsAudioPodcastEncodeComplete flag
3. If true → send message to background script
4. Background fetches audio from Panopto CDN (bypasses CORS)
5. Background uploads directly to /api/lectures/audio
6. Return result to content script
```

### Fallback Path (Server-Side Processing)

```
1. If audio podcast not ready OR primary path fails
2. Send stream URL to /api/lectures/download
3. Backend downloads video and extracts audio via ffmpeg
```

## Key Files

| File | Role |
|------|------|
| `src/background.ts` | Fetches audio, uploads to backend |
| `src/contents/panopto.tsx` | Orchestrates flow, extracts metadata |
| `src/popup/routes/home.tsx` | Progress UI |
| `src/lib/types.ts` | Shared type definitions |

## API Endpoints

### Primary: `/api/lectures/audio`
```
POST /api/lectures/audio
Content-Type: multipart/form-data
Authorization: Bearer <token>

Fields:
- audio: File (M4A, ~75MB)
- metadata: JSON string
  {
    "session_id": "uuid",
    "course_id": "string",
    "title": "Lecture Title",
    "duration": 3600,
    "source_url": "https://..."
  }
```

### Fallback: `/api/lectures/download`
```
POST /api/lectures/download
Content-Type: application/json
Authorization: Bearer <token>

Body:
{
  "course_id": "string",
  "panopto_url": "https://...",
  "stream_url": "https://cloudfront...",
  "title": "Lecture Title"
}
```

## Fallback Detection

| Check | How | Action |
|-------|-----|--------|
| Encoding ready | `IsAudioPodcastEncodeComplete === true` | Skip if false |
| HTTP status | `response.ok` | Fallback if not 2xx |
| Content-Type | Must be `video/mp4` or `audio/*` | Fallback if HTML |
| Fetch error | try/catch | Fallback on error |

## CORS Solution

Content scripts run in the page's origin and cannot fetch from Panopto's CDN due to CORS. Solution:

1. Background script (service worker) makes the fetch
2. Background has host_permissions for `*.hosted.panopto.com`
3. Service workers bypass CORS when they have permissions
4. Background uploads directly to backend (no data transfer between contexts)

## Progress States

| Phase | Message | Color |
|-------|---------|-------|
| downloading | "Downloading audio..." | Blue |
| uploading | "Uploading to Study Buddy..." | Purple |
| processing | "Processing..." | Amber |
| done | "Upload complete!" | Green |
| error | Error message | Red |

## Testing Checklist

- [ ] Verify audioPodcast URL works for multiple lectures
- [ ] Verify IsAudioPodcastEncodeComplete flag accuracy
- [ ] Test fallback when audio not available
- [ ] Test fallback on fetch error
- [ ] Test fallback on login redirect (content-type check)
- [ ] Test with various lecture lengths
- [ ] Verify progress indicators work
- [ ] Test error states

---

**Related Docs:**
- [Project Architecture](../System/project_architecture.md)
