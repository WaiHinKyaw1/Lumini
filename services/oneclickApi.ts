/**
 * OneClick Recap EN→MM — Frontend API Client
 * =============================================
 * Communicates with the OneClick FastAPI service running on AWS.
 * Handles: upload, status polling, download, cleanup.
 */

const getBaseUrl = (): string => {
  const dedicated = import.meta.env.VITE_ONECLICK_URL;
  if (dedicated) return dedicated.replace(/\/$/, '');

  const mediaWorker = import.meta.env.VITE_MEDIA_WORKER_URL || '';
  if (mediaWorker) return mediaWorker.replace(/\/$/, '');

  return 'http://localhost:8080';
};

// ─── Types ────────────────────────────────────────────────────────

export interface OneClickVoice {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  description: string;
}

export interface OneClickSpeed {
  value: string;
  label: string;
}

export interface OneClickRatio {
  value: string;
  label: string;
}

export interface OneClickVoicesResponse {
  voices: OneClickVoice[];
  speeds: OneClickSpeed[];
  ratios: OneClickRatio[];
}

export interface OneClickHealthResponse {
  online: boolean;
  service: string;
  version: string;
  ready: boolean;
  dependencies: Record<string, boolean>;
}

export interface OneClickStartResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface OneClickJobStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  step: string;
  progress: number;
  message: string;
  voice?: string;
  speed?: string;
  ratio?: string;
  source_file?: string;
  source_size_mb?: number;
  output_duration?: number;
  output_size_mb?: number;
  error?: string;
  created_at?: number;
}

export interface OneClickTranscript {
  english_segments?: Array<{ start: number; end: number; text: string }>;
  myanmar_segments?: Array<{ start: number; end: number; text: string; narration: string }>;
}

// ─── API Functions ────────────────────────────────────────────────

/**
 * Check if the OneClick service is online and all dependencies are ready.
 */
export async function checkOneClickHealth(): Promise<OneClickHealthResponse> {
  const res = await fetch(`${getBaseUrl()}/api/oneclick/health`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/**
 * Get available voices, speeds, and aspect ratios.
 */
export async function getOneClickVoices(): Promise<OneClickVoicesResponse> {
  const res = await fetch(`${getBaseUrl()}/api/oneclick/voices`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch voices: ${res.status}`);
  return res.json();
}

export interface OneClickJobOptions {
  voice: string;
  speed: string;
  ratio: string;
  tempId?: string;
  enableSubtitles?: boolean;
  enableBlur?: boolean;
  blurPosition?: number | string;
  blurThickness?: number;
  blurIntensity?: number;
  subtitleStyle?: string;
  watermarkText?: string;
  logoFile?: File | null;
  logoX?: number;
  logoY?: number;
  logoAlign?: 'left' | 'center' | 'right';
  logoScale?: number;
  logoOpacity?: number;
  includeOriginalAudio?: boolean;
  voiceSample?: File | null;
  voiceId?: string;
  elevenlabsApiKey?: string;
  enableIntroHook?: boolean;
  introHookText?: string;
}

/**
 * Pre-download YouTube or TikTok video so it displays in live preview player before processing.
 */
export async function fetchOneClickUrlVideo(url: string): Promise<{
  success: boolean;
  temp_id: string;
  duration: number;
  width: number;
  height: number;
  filename: string;
  preview_url: string;
}> {
  const form = new FormData();
  form.append('url', url.trim());
  const res = await fetch(`${getBaseUrl()}/api/oneclick/fetch-video`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to download video from URL' }));
    throw new Error(err.detail || 'Failed to download video from URL');
  }
  const data = await res.json();
  // Ensure full URL is provided if preview_url is relative
  if (data.preview_url && data.preview_url.startsWith('/')) {
    data.preview_url = `${getBaseUrl()}${data.preview_url}`;
  }
  return data;
}

/**
 * Upload a video or send a video URL (YouTube, TikTok) and start the OneClick pipeline.
 */
export async function startOneClickJob(
  input: { file?: File | null; videoUrl?: string; tempId?: string },
  options: OneClickJobOptions
): Promise<OneClickStartResponse> {
  const formData = new FormData();
  if (input.file) {
    formData.append('file', input.file);
  }
  if (input.tempId || options.tempId) {
    formData.append('temp_id', String(input.tempId || options.tempId));
  }
  if (input.videoUrl) {
    formData.append('video_url', input.videoUrl.trim());
  }
  formData.append('voice', options.voice);
  formData.append('speed', options.speed);
  formData.append('ratio', options.ratio);
  formData.append('enable_subtitles', String(options.enableSubtitles !== false));
  formData.append('enable_blur', String(Boolean(options.enableBlur)));

  if (options.blurPosition !== undefined) {
    formData.append('blur_position', String(options.blurPosition));
  } else {
    formData.append('blur_position', '82');
  }

  if (options.blurThickness !== undefined) {
    formData.append('blur_thickness', String(options.blurThickness));
  }
  if (options.blurIntensity !== undefined) {
    formData.append('blur_intensity', String(options.blurIntensity));
  }
  if (options.subtitleStyle) {
    formData.append('subtitle_style', options.subtitleStyle);
  }
  if (options.voiceSample) {
    formData.append('voice_sample', options.voiceSample);
  }
  if (options.voiceId) {
    formData.append('voice_id', options.voiceId);
  }
  if (options.elevenlabsApiKey) {
    formData.append('elevenlabs_api_key', options.elevenlabsApiKey.trim());
  }
  if (options.watermarkText) formData.append('watermark_text', options.watermarkText.trim());
  if (options.logoFile) {
    formData.append('logo_file', options.logoFile);
  }
  if (options.logoX !== undefined) formData.append('logo_x', String(options.logoX));
  if (options.logoY !== undefined) formData.append('logo_y', String(options.logoY));
  if (options.logoAlign) formData.append('logo_align', options.logoAlign);
  if (options.logoScale !== undefined) formData.append('logo_scale', String(options.logoScale));
  if (options.logoOpacity !== undefined) formData.append('logo_opacity', String(options.logoOpacity));
  formData.append('include_original_audio', String(Boolean(options.includeOriginalAudio)));
  formData.append('enable_intro_hook', String(options.enableIntroHook === true));
  if (options.introHookText) {
    formData.append('intro_hook_text', options.introHookText.trim());
  }

  const res = await fetch(`${getBaseUrl()}/api/oneclick/start`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `Upload failed: ${res.status}` }));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Poll job status. Returns current progress and status.
 */
export async function getOneClickJobStatus(jobId: string): Promise<OneClickJobStatus> {
  const res = await fetch(`${getBaseUrl()}/api/oneclick/status/${jobId}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

/**
 * Download the completed video.
 */
export async function downloadOneClickResult(jobId: string): Promise<Blob> {
  const res = await fetch(`${getBaseUrl()}/api/oneclick/download/${jobId}`, {
    method: 'GET',
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.blob();
}

/**
 * Get the download URL for the completed video (for direct link).
 */
export function getOneClickDownloadUrl(jobId: string): string {
  return `${getBaseUrl()}/api/oneclick/download/${jobId}`;
}

/**
 * Get the direct download URL for the Myanmar subtitle (.srt) file.
 */
export function getOneClickSrtDownloadUrl(jobId: string): string {
  return `${getBaseUrl()}/api/oneclick/subtitles/${jobId}`;
}

/**
 * Get the direct download URL for the intro thumbnail cover (.jpg) image.
 */
export function getOneClickThumbnailUrl(jobId: string): string {
  return `${getBaseUrl()}/api/oneclick/thumbnail/${jobId}`;
}

/**
 * Get English transcript and Myanmar translations for a job.
 */
export async function getOneClickTranscript(jobId: string): Promise<OneClickTranscript> {
  const res = await fetch(`${getBaseUrl()}/api/oneclick/transcript/${jobId}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Transcript fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Delete/cleanup a completed or failed job.
 */
export async function deleteOneClickJob(jobId: string): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/oneclick/job/${jobId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Cleanup failed: ${res.status}`);
}

/**
 * Helper: Poll job status until completion or failure.
 * Calls onProgress callback with each status update.
 * Returns the final status.
 */
export async function pollOneClickJob(
  jobId: string,
  onProgress: (status: OneClickJobStatus) => void,
  intervalMs: number = 2000,
  maxPolls: number = 600, // 20 minutes max
): Promise<OneClickJobStatus> {
  for (let i = 0; i < maxPolls; i++) {
    const status = await getOneClickJobStatus(jobId);
    onProgress(status);

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Polling timeout: job took too long.');
}
