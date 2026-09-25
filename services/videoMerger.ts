/**
 * Video Merger — ffmpeg processing runs on the AWS media worker server.
 * This module provides the VideoMerger class (delegates to AWS) and
 * pure utility helpers (estimateSyncSpeed, measureAudioDuration) that
 * run entirely client-side without any ffmpeg dependency.
 */

/**
 * One-click final render: delegates to the AWS media worker.
 * The browser-side ffmpeg.wasm fallback has been removed —
 * use the media worker API (mediaWorkerApi.ts) instead.
 */
export class VideoMerger {
  async load(_onProgress?: (msg: string, pct: number) => void): Promise<void> {
    // No-op: processing is handled by the AWS media worker
  }

  async merge(
    _videoFile: File,
    _audioBlob: Blob,
    _opts: { muteOriginal?: boolean; videoSpeed?: number; onProgress?: (msg: string, pct: number) => void } = {}
  ): Promise<Blob> {
    throw new Error(
      'Browser-side ffmpeg is not configured. Please use the AWS media worker instead. ' +
      'Ensure VITE_MEDIA_WORKER_URL is set and the worker is running.'
    );
  }
}

/**
 * Compute how much the voiceover audio would need to be sped up to match
 * the original video duration. Returns speed >= 1.0 (never slows down, to
 * protect pitch realism; > 1.15 is capped and caller should warn).
 */
export function estimateSyncSpeed(
  videoDurationSec: number,
  voiceDurationSec: number
): number {
  if (!videoDurationSec || !voiceDurationSec || videoDurationSec <= 0) return 1.0;
  const ratio = voiceDurationSec / videoDurationSec;
  // If voice is longer than video, we speed it up (max 1.2 to keep it natural)
  if (ratio > 1.05) return Math.min(ratio, 1.2);
  // If voice is shorter, pad by playing slightly slower is avoided; return 1
  return 1.0;
}

/** Measure the duration of a generated voiceover Blob using HTMLAudioElement */
export function measureAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(dur);
    });
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      resolve(0);
    });
    audio.src = url;
  });
}

export const merger = new VideoMerger();
