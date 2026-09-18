# Lumini Media Worker

This service is the Phase 2 server-side foundation for large video/audio synchronization. It keeps heavy FFmpeg work out of the browser and is designed to run on an always-free Linux VM or another Docker-capable host.

## Local run

```bash
cd server
pnpm install
pnpm start
```

The service listens on `0.0.0.0:8080` by default. FFmpeg must be installed and available on `PATH` when running without Docker.

## Docker run

```bash
docker build -t lumini-media-worker .
docker run --rm -p 8080:8080 -v "$PWD/data:/app/data" lumini-media-worker
```

## API flow

1. `POST /api/media/upload` with a multipart field named `file`.
2. `POST /api/sync/jobs` with `{ "fileId": "...", "audioFileId": "...", "settings": { ... } }`.
3. Poll `GET /api/jobs/:jobId` until `status` is `completed` or `failed`.
4. Download the result from `GET /api/files/:outputFileId/download`.
5. Delete or expire the job when the user is finished.

The default upload limit is 1GB. Override it with `MAX_UPLOAD_BYTES`. Temporary files are kept under `MEDIA_DATA_DIR` and completed jobs expire after `JOB_TTL_MS`.

Movie Recap uses this worker automatically when `VITE_MEDIA_WORKER_URL` is configured. If it is not configured, the existing browser export remains available as a fallback.

## Secure Voice Clone Proxy

Set `ELEVENLABS_API_KEY` only in the server environment. Never put this key in the frontend `.env`, browser localStorage, Git, or the Docker image. The backend exposes `POST /api/voice-clones`, `POST /api/voice-clones/:voiceId/synthesize`, `DELETE /api/voice-clones/:voiceId`, and `GET /api/voice-clones/status`. When `VITE_MEDIA_WORKER_URL` is configured, Voiceover uses these endpoints and does not send the provider key from the browser.

On the AWS host, configure the key through an environment file with restricted permissions, then recreate the container:

```bash
sudo install -m 600 /dev/null /opt/lumini-media-worker/worker.env
sudoedit /opt/lumini-media-worker/worker.env
# add: ELEVENLABS_API_KEY=your_key_here
docker rm -f lumini-media-worker
docker run -d --name lumini-media-worker --restart unless-stopped -p 8080:8080 \
  --env-file /opt/lumini-media-worker/worker.env \
  -e CORS_ORIGIN="*" \
  -v /opt/lumini-media-worker/data:/app/data lumini-media-worker:latest
```

## Current scope

This first version supports video input, optional replacement audio, video/audio speed controls, aspect-ratio padding, MP4/H.264 output, health checks, job status, cancellation flags, and automatic cleanup. Logo compositing, blur strips, zoom effects, authentication, signed object-storage URLs, resumable uploads, and voice-provider proxying are intentionally reserved for later phases. The browser fallback remains the path for those visual effects until their server equivalents are implemented.

Do not expose this endpoint publicly until authentication, rate limiting, and private storage are configured.
