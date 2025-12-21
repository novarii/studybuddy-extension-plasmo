# StudyBuddy Extension Documentation

This folder contains all documentation for the StudyBuddy Chrome extension.

## Quick Start

1. Read [Project Architecture](./System/project_architecture.md) for system overview
2. Check [Tasks](./Tasks/) for feature implementations
3. Follow [SOP](./SOP/) for common operations

---

## Documentation Index

### System Documentation

| Document | Description |
|----------|-------------|
| [Project Architecture](./System/project_architecture.md) | Tech stack, project structure, data flow, API endpoints |

### Feature Documentation (Tasks)

| Document | Description |
|----------|-------------|
| [Audio Ingestion](./Tasks/audio_ingestion.md) | Direct audio upload feature with fallback to server-side processing |

### Standard Operating Procedures (SOP)

*No SOPs documented yet.*

---

## Project Overview

**StudyBuddy Extension** is a Chrome browser extension that captures Panopto lecture recordings and sends them to a backend for transcription.

### Key Features
- Extract lectures from Panopto pages
- Direct audio download (~75MB) when available
- Fallback to video URL for server-side processing
- Progress tracking with visual feedback
- Clerk authentication

### Tech Stack
- Plasmo 0.90.5 (Chrome MV3)
- React 18 + React Router 7
- TypeScript
- Clerk Authentication

---

## Folder Structure

```
.agent/
├── README.md                 # This file - documentation index
├── System/                   # System architecture docs
│   └── project_architecture.md
├── Tasks/                    # Feature PRDs and implementation docs
│   └── audio_ingestion.md
└── SOP/                      # Standard operating procedures
```

---

*Last updated: December 2024*
