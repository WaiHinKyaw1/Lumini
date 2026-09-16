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

const requireBaseUrl = () => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error('Media worker is not configured. Set VITE_MEDIA_WORKER_URL.');
  return baseUrl;
};

export async function uploadMedia(file: File, onProgress?: (progress: number) => void): Promise<MediaUploadResult> {
  const baseUrl = requireBaseUrl();
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${baseUrl}/api/media/upload`, { method: 'POST', body });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Media upload failed.');
  onProgress?.(100);
  return response.json() as Promise<MediaUploadResult>;
}

export async function createSyncJob(fileId: string, settings: SyncSettings, audioFileId?: string): Promise<SyncJob> {
  const response = await fetch(`${requireBaseUrl()}/api/sync/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, audioFileId, settings }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Could not create sync job.');
  return response.json() as Promise<SyncJob>;
}

export async function getSyncJob(jobId: string): Promise<SyncJob> {
  const response = await fetch(`${requireBaseUrl()}/api/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error('Could not read sync job status.');
  return response.json() as Promise<SyncJob>;
}

export function getOutputUrl(outputFileId: string): string {
  return `${requireBaseUrl()}/api/files/${encodeURIComponent(outputFileId)}/download`;
}
