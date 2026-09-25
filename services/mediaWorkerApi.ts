export interface MediaUploadResult {
  fileId: string;
  filename: string;
  size: number;
  mimeType: string;
  kind: 'video' | 'audio';
}

export interface SyncSettings {
  videoSpeed?: number;
  audioSpeed?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  blurEnabled?: boolean;
  blurPosition?: number;
  blurThickness?: number;
  blurIntensity?: number;
  subtitleEnabled?: boolean;
  subtitleText?: string;
  subtitleStyle?: string;
}

export interface SyncJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputFileId?: string;
  error?: string;
}

const getBaseUrl = () => (import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '');

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal || controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export const isMediaWorkerConfigured = (): boolean => Boolean(getBaseUrl());

export async function isMediaWorkerAvailable(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) return false;
  try {
    const response = await fetchWithTimeout(`${baseUrl}/health`, {}, 5000);
    return response.ok;
  } catch {
    return false;
  }
}

const requireBaseUrl = () => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('Media worker is not configured. Set VITE_MEDIA_WORKER_URL.');
  return baseUrl;
};

export function uploadMedia(
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<MediaUploadResult> {
  const baseUrl = requireBaseUrl();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Media upload cancelled.', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/api/media/upload`);
    xhr.timeout = 10 * 60 * 1000;

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('Media upload cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as MediaUploadResult;
          onProgress?.(100);
          resolve(result);
        } catch {
          reject(new Error('Invalid response received from media server.'));
        }
      } else {
        let msg = 'Media upload failed.';
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData?.error) msg = errData.error;
        } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Connection error during upload to media server.'));
    };

    xhr.ontimeout = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Upload timed out. Please check your connection and retry.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

export async function createSyncJob(fileId: string, settings: SyncSettings, audioFileId?: string): Promise<SyncJob> {
  const response = await fetchWithTimeout(`${requireBaseUrl()}/api/sync/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, audioFileId, settings }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not create sync job.');
  return response.json() as Promise<SyncJob>;
}

export async function getSyncJob(jobId: string): Promise<SyncJob> {
  const response = await fetchWithTimeout(`${requireBaseUrl()}/api/jobs/${encodeURIComponent(jobId)}`, {}, 15000);
  if (!response.ok) throw new Error('Could not read sync job status.');
  return response.json() as Promise<SyncJob>;
}

export async function waitForSyncJob(
  jobId: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<SyncJob> {
  for (;;) {
    if (signal?.aborted) throw new DOMException('Sync job cancelled.', 'AbortError');
    const job = await getSyncJob(jobId);
    onProgress?.(job.progress);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      if (job.status !== 'completed') throw new Error(job.error || `Sync job ${job.status}.`);
      return job;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1000);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Sync job cancelled.', 'AbortError'));
      }, { once: true });
    });
  }
}

export function getOutputUrl(outputFileId: string): string {
  return `${requireBaseUrl()}/api/files/${encodeURIComponent(outputFileId)}/download`;
}

export interface ExtractedAudioResult {
  audioBase64: string;
  mimeType: string;
  size: number;
}

export async function extractAudioFromMedia(fileId: string): Promise<ExtractedAudioResult> {
  const baseUrl = requireBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/api/media/${encodeURIComponent(fileId)}/extract-audio`, {
    method: 'POST',
  }, 60000);
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || 'Audio extraction failed on server.');
  }
  return response.json() as Promise<ExtractedAudioResult>;
}
