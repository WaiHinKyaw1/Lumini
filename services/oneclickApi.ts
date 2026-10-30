/**
 * OneClick Recap EN→MM — Frontend API Client
 * =============================================
 * Communicates with the OneClick FastAPI service running on AWS.
 * Handles: upload, status polling, download, cleanup.
 */

let activeOneClickUrl: string | null = null;
try {
  if (typeof window !== 'undefined') {
    activeOneClickUrl = window.sessionStorage?.getItem('lumini_tunnel_url')
      || window.localStorage?.getItem('lumini_tunnel_url')
      || null;
  }
} catch {}

export const setDirectOneClickUrl = (url: string) => {
  activeOneClickUrl = url.replace(/\/$/, '');
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.setItem('lumini_tunnel_url', activeOneClickUrl);
      window.localStorage?.setItem('lumini_tunnel_url', activeOneClickUrl);
    }
  } catch {}
};

export const getBaseUrl = (): string => {
  if (activeOneClickUrl !== null) return activeOneClickUrl;

  const dedicated = import.meta.env.VITE_ONECLICK_URL;
  if (dedicated) return dedicated.replace(/\/$/, '');

  const mediaWorker = import.meta.env.VITE_MEDIA_WORKER_URL || '';
  if (mediaWorker) return mediaWorker.replace(/\/$/, '');

  // If in browser over HTTPS, default to Cloudflare HTTPS tunnel to prevent Mixed Content block and bypass Vercel 4.5MB limit
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return 'https://solar-bug-association-invoice.trycloudflare.com';
  }

  return 'http://16.170.108.153:8080';
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
  const urlsToTry: string[] = [];
  const primary = getBaseUrl();
  if (primary) urlsToTry.push(`${primary}/api/oneclick/health`);
  urlsToTry.push('https://solar-bug-association-invoice.trycloudflare.com/api/oneclick/health');
  urlsToTry.push('/api/oneclick/health');
  urlsToTry.push('/worker/api/oneclick/health');
  if (primary !== 'http://16.170.108.153:8080') {
    urlsToTry.push('http://16.170.108.153:8080/api/oneclick/health');
  }

  let lastError: any = null;
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        if (data && typeof data === 'object' && data.online !== undefined) {
          const resolvedBase = (data.tunnelUrl && typeof data.tunnelUrl === 'string' && data.tunnelUrl.startsWith('https://'))
            ? data.tunnelUrl.replace(/\/$/, '')
            : url.replace(/\/api\/oneclick\/health$/, '');
          setDirectOneClickUrl(resolvedBase);
          return data as OneClickHealthResponse;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(lastError?.message || 'Health check failed: Worker Offline');
}

/**
 * Get available voices, speeds, and aspect ratios.
 */
export async function getOneClickVoices(): Promise<OneClickVoicesResponse> {
  const urlsToTry: string[] = [];
  const primary = getBaseUrl();
  if (primary) urlsToTry.push(`${primary}/api/oneclick/voices`);
  urlsToTry.push('/api/oneclick/voices');
  urlsToTry.push('/worker/api/oneclick/voices');
  if (primary !== 'http://16.170.108.153:8080') {
    urlsToTry.push('http://16.170.108.153:8080/api/oneclick/voices');
  }

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text);
        if (data && Array.isArray(data.voices)) {
          activeOneClickUrl = url.replace(/\/api\/oneclick\/voices$/, '');
          return data as OneClickVoicesResponse;
        }
      }
    } catch { }
  }

  return {
    voices: [
      { id: 'my-MM-KingBurma', name: 'King Burma (မင်းမြန်မာ)', gender: 'Male', description: 'TikTok & FB နာမည်ကြီး King Burma စတိုင် — ညို့ဓာတ်ပါသော အသံနက်၊ ဆွဲဆောင်မှုပြည့် ဇာတ်လမ်းပြောဟန်' },
      { id: 'my-MM-ThihaNeural', name: 'Thiha (သီဟ)', gender: 'Male', description: 'ခန့်ညားပြတ်သား — Movie recap narration ပုံစံ' },
      { id: 'my-MM-ZawNeural', name: 'Zaw (ဇော်)', gender: 'Male', description: 'တည်ငြိမ်ရင့်ကျက် ဩဇာပြည့် — ဇာတ်ရှိန်မြှင့် Deep & Cinematic' },
      { id: 'my-MM-WunnaNeural', name: 'Wunna (ဝဏ္ဏ)', gender: 'Male', description: 'တက်ကြွမြူးကြွ သွက်လက် — လူငယ်ဆန်ဆန် Energetic Viral' },
      { id: 'my-MM-NilarNeural', name: 'Nilar (နီလာ)', gender: 'Female', description: 'ချိုသာကြည်လင် — ညင်သာကြည်နူးဖွယ် စကားပြောစတိုင်' },
    ],
    speeds: [
      { value: '-50%', label: 'Slow (0.5x)' },
      { value: '-25%', label: 'Slightly Slow (0.75x)' },
      { value: '+0%', label: 'Normal (1x)' },
      { value: '+25%', label: 'Slightly Fast (1.25x)' },
      { value: '+50%', label: 'Fast (1.5x)' },
    ],
    ratios: [
      { value: 'original', label: 'Original' },
      { value: '16:9', label: 'Landscape (16:9)' },
      { value: '9:16', label: 'Portrait (9:16)' },
      { value: '1:1', label: 'Square (1:1)' },
    ],
  };
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
  blurWidth?: number;
  blurX?: number;
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

export const extractCleanUrl = (raw: string): string => {
  if (!raw) return '';
  const match = raw.match(/https?:\/\/[^\s<>"']+/i);
  if (match) {
    return match[0].replace(/[\s.,;!?)]}。，！？】」）]+$/, '');
  }
  return raw.trim();
};

/**
 * Pre-download YouTube, TikTok, or Rednote video so it displays in live preview player before processing.
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
  const cleanUrl = extractCleanUrl(url);
  const form = new FormData();
  form.append('url', cleanUrl);
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
    formData.append('video_url', extractCleanUrl(input.videoUrl));
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
  if (options.blurWidth !== undefined) {
    formData.append('blur_width', String(options.blurWidth));
  }
  if (options.blurX !== undefined) {
    formData.append('blur_x', String(options.blurX));
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
 * Get direct streaming URL for video preview player (inline, smooth range streaming).
 */
export function getOneClickStreamUrl(jobId: string): string {
  return `${getBaseUrl()}/api/oneclick/stream/${jobId}`;
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

/**
 * Get direct audio stream URL for voice sample preview (Thiha, Zaw, Wunna, Nilar)
 */
export function getOneClickVoiceSampleUrl(voiceId: string): string {
  let key = 'thiha';
  const v = voiceId.toLowerCase();
  if (v.includes('king') || v.includes('burma')) key = 'kingburma';
  else if (v.includes('zaw')) key = 'zaw';
  else if (v.includes('wun') || v.includes('wanna')) key = 'wunna';
  else if (v.includes('nilar')) key = 'nilar';
  return `${getBaseUrl()}/api/oneclick/voice-sample/${key}`;
}
