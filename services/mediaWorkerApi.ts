export interface MediaUploadResult {
  fileId: string;
  filename: string;
  size: number;
  mimeType: string;
  kind: 'video' | 'audio';
}

export interface SyncSettings {
  syncMode?: 'standard' | 'smart';
  trimSilenceGaps?: boolean;
  maxVideoSpeed?: number;
  videoDuration?: number;
  audioDuration?: number;
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
  subtitleOffset?: number;
  logoFileId?: string;
  logoY?: number; // 0 to 100% (vertical position)
  logoAlign?: 'left' | 'center' | 'right';
  logoScale?: number; // 4 to 40%
  logoOpacity?: number; // 0.1 to 1.0
}

export interface SyncJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputFileId?: string;
  syncLog?: string;
  error?: string;
}

let cachedWorkerUrl: string | null = null;
try {
  if (typeof window !== 'undefined') {
    cachedWorkerUrl = window.sessionStorage?.getItem('lumini_tunnel_url') || null;
  }
} catch {}

export const setDirectWorkerUrl = (url: string) => {
  cachedWorkerUrl = url.replace(/\/$/, '');
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.setItem('lumini_tunnel_url', cachedWorkerUrl);
    }
  } catch {}
};

const getBaseUrl = (): string => {
  if (cachedWorkerUrl) return cachedWorkerUrl;

  const envUrl = (import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '');
  // If running in browser over HTTPS (e.g. Vercel deployment)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    if (envUrl.startsWith('https://')) return envUrl;
    // Route through same-origin rewrite to avoid Mixed Content block:
    return '/worker';
  }

  return envUrl || 'http://16.170.108.153:8080';
};

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
  const urlsToTry: string[] = [];
  if (cachedWorkerUrl) urlsToTry.push(cachedWorkerUrl);
  const envUrl = (import.meta.env.VITE_MEDIA_WORKER_URL || '').replace(/\/$/, '');
  if (envUrl) urlsToTry.push(envUrl);
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    urlsToTry.push('/worker');
  } else {
    urlsToTry.push('http://16.170.108.153:8080');
  }

  for (const url of urlsToTry) {
    try {
      const response = await fetchWithTimeout(`${url}/health`, {}, 5000);
      if (response.ok) {
        try {
          const data = await response.json();
          // If server returns an HTTPS tunnel URL, adopt it directly to bypass Vercel proxy payload limits
          if (data?.tunnelUrl && typeof data.tunnelUrl === 'string' && data.tunnelUrl.startsWith('https://')) {
            setDirectWorkerUrl(data.tunnelUrl);
          } else if (url.startsWith('https://')) {
            setDirectWorkerUrl(url);
          }
        } catch {}
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
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
        let msg = `Media upload failed (Status ${xhr.status}).`;
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData?.error) msg = errData.error;
        } catch {
          if (xhr.status === 413) {
            msg = 'ဗီဒီယို ဖိုင်ဆိုဒ် ကြီးလွန်းပါသည် (413 Payload Too Large)။ Vercel proxy ခံထားပါက HTTPS Direct Server သို့ ပြောင်းလဲ ချိတ်ဆက်ပေးပါ။';
          } else if (xhr.status === 504 || xhr.status === 502) {
            msg = 'Upload ကြာချိန် ကန့်သတ်ချက် ကျော်လွန်သွားပါသည် (504 Gateway Timeout)။';
          } else if (xhr.responseText) {
            msg = `Media upload failed: ${xhr.responseText.slice(0, 150)}`;
          }
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Connection error during upload to media server. Mixed Content (HTTP/HTTPS) သို့မဟုတ် Network ပိတ်နေနိုင်ပါသည်။'));
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

export async function createSyncJob(fileId: string, settings: SyncSettings, audioFileId?: string, logoFileId?: string): Promise<SyncJob> {
  const effectiveLogoId = logoFileId || settings.logoFileId;
  const response = await fetchWithTimeout(`${requireBaseUrl()}/api/sync/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, audioFileId, logoFileId: effectiveLogoId, settings }),
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
