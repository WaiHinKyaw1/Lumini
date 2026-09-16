# Lumini Voiceover and FFmpeg Server Migration Plan

## Objective

Move heavy voiceover, voice-clone, and video/audio synchronization work away from the browser while keeping the initial implementation low-cost. The migration is intentionally divided into phases so that each stage can be tested independently and external API credits are not consumed during architecture work.

## Recommended architecture

For the current requirement, the recommended processing host is a small always-on Linux VM with FFmpeg installed. The frontend uploads media using multipart or resumable requests. The server stores temporary input files, runs FFmpeg, uploads the result to object storage, and returns a short-lived download URL. Voice provider API keys remain server-side.

The browser should retain only lightweight responsibilities: selecting files, showing upload and processing progress, polling a job status endpoint, previewing the returned result, and allowing the user to download or discard it.

```text
Lumini React frontend
        |
        | upload + job request
        v
Processing API
  |-- FFmpeg: merge, speed, aspect ratio, blur, logo, export
  |-- Voice provider proxy: TTS / approved voice clone
  |-- Job status and cleanup
        |
        v
Private object storage
```

## Phase plan

| Phase | Scope | External API credits | Exit criteria |
|---|---|---:|---|
| 1 | Define contracts, limits, security rules, and frontend integration points | None | Interfaces and limits are documented; current app still builds |
| 2 | Deploy the FFmpeg service and implement large-file upload | None for voice generation | A 100MB+ sample can upload, sync, download, and clean up |
| 3 | Move TTS and approved voice-clone calls behind the backend | Provider quota only during tests | API keys are never exposed to the browser; generated audio works |
| 4 | Add background queue, progress events, retries, and production cleanup | Minimal test usage | Long jobs survive browser refresh and failures are recoverable |

## Phase 1 decisions

### File limits

The browser must not convert large videos to Base64. Uploads should use `multipart/form-data`; resumable chunking should be added before supporting very large files. The initial server contract should accept videos up to 1 GB, but enforce a configurable limit through an environment variable. The server must reject unsupported MIME types, prevent path traversal, and delete temporary files after completion or expiry.

### Job contract

The frontend should eventually call the following endpoints:

```text
POST /api/media/upload
  multipart file upload
  returns { fileId, size, mimeType }

POST /api/sync/jobs
  body: { fileId, audioFileId?, settings }
  returns { jobId }

GET /api/jobs/:jobId
  returns { status, progress, outputFileId?, error? }

GET /api/files/:fileId/download
  returns a short-lived signed URL or streams the file

DELETE /api/jobs/:jobId
  cancels the job and removes temporary files
```

The `settings` object should contain only validated values: `videoSpeed`, `audioSpeed`, `aspectRatio`, `blurEnabled`, `blurPosition`, `blurThickness`, `blurIntensity`, `zoomEnabled`, `zoomInterval`, `zoomDuration`, and `logoPosition`.

### Resource policy

The free-server first version should process one export job at a time. A job should have a maximum runtime, a maximum output size, and an automatic cleanup deadline. The input and output must not be stored permanently by default. For a 100MB input, the server should reserve enough temporary disk for the source, the output, and FFmpeg working files before starting.

### Voice-clone safety

Voice cloning must require an explicit consent confirmation. Only a user-owned voice or a voice for which the user has permission may be submitted. Reference audio and clone identifiers must be private. Provider keys must be environment secrets and must never be sent to the browser or written to logs. Users must be able to delete their clone profile and its provider-side clone where supported.

## Hosting options

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| Always-free Linux VM | Best fit for FFmpeg and 100MB+ files; requires account setup, security hardening, and maintenance | Provider free tier, subject to availability and limits | Medium |
| Managed web service | Easier deployment and TLS; small free instances may sleep, timeout, or have insufficient memory for long FFmpeg jobs | Free to start; usage limits apply | Low to medium |
| Browser-only FFmpeg | No server setup and no hosting cost; large files consume device memory and can fail when the tab closes | Free | Low initially, poor reliability |

The first implementation should target the always-free Linux VM architecture, while keeping the API contract portable so it can later be deployed to another host.

## Credit-saving rules

No voice provider request should be made during Phase 1. Test Phase 2 with a short synthetic or user-provided audio sample. Use one small integration test per provider in Phase 3. Do not regenerate the same voiceover repeatedly during UI testing; cache job results by a content hash when safe. Keep AI script generation separate from deterministic FFmpeg processing so a video export does not consume AI credits.

## Current implementation status

Phase 1 is being prepared on the `development` branch. The existing browser implementation remains available until the server endpoint is verified. No changes are made to `main`.
