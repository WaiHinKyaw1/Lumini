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

export async function uploadMedia(file: File, onProgress?: (progress: number) => void): Promise<MediaUploadResult> {
  const baseUrl = requireBaseUrl();
  const body = new FormData();
  body.append('file', file);
  const response = await fetchWithTimeout(`${baseUrl}/api/media/upload`, { method: 'POST', body });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Media upload failed.');
  onProgress?.(100);
  return response.json() as Promise<MediaUploadResult>;
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
