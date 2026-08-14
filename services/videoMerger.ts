import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const FFMPEG_CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

/**
 * One-click final render: replace the original audio with the Burmese voiceover
 * and merge back into a web-playable MP4. Runs entirely in the browser (free, open-source).
 */
export class VideoMerger {
  private ffmpeg: FFmpeg | null = null;
  private loaded = false;
  private loading: Promise<void> | null = null;

  async load(onProgress?: (msg: string, pct: number) => void): Promise<void> {
    if (this.loaded) return;
    if (this.loading) {
      await this.loading;
      return;
    }
    this.loading = (async () => {
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }) => {
        if (onProgress) onProgress(message, -1);
      });
      const baseURL = FFMPEG_CDN;
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      this.ffmpeg = ffmpeg;
      this.loaded = true;
    })();
    await this.loading;
    this.loading = null;
  }

  async merge(
    videoFile: File,
    audioBlob: Blob,
    opts: { muteOriginal?: boolean; videoSpeed?: number; onProgress?: (msg: string, pct: number) => void } = {}
  ): Promise<Blob> {
    const { muteOriginal = true, videoSpeed = 1.0, onProgress } = opts;
    await this.load(onProgress);
    const ffmpeg = this.ffmpeg!;

    const videoData = await fetchFile(videoFile);
    const audioData = await fetchFile(audioBlob);
    await ffmpeg.writeFile('video.mp4', videoData);
    await ffmpeg.writeFile('voice.wav', audioData);

    // Replace original audio with voiceover (muted original), passthrough video.
    // If videoSpeed != 1, scale the voice atempo to keep audio/video in sync.
    const atempo = videoSpeed !== 1 ? `,atempo=${videoSpeed.toFixed(4)}` : '';
    const videoFilter =
      videoSpeed !== 1
        ? `-filter:v "setpts=${(1 / videoSpeed).toFixed(6)}*PTS"`
        : '';

    await ffmpeg.exec([
      ...(videoFilter ? videoFilter.split(' ') : []),
      '-i',
      'video.mp4',
      '-i',
      'voice.wav',
      '-filter_complex',
      `[1:a]aformat=sample_rates=44100:channel_layouts=stereo${atempo}[newa]`,
      '-map',
      '0:v',
      '-map',
      '[newa]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      'output.mp4',
    ]);

    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([data as Uint8Array], { type: 'video/mp4' });
    try {
      await ffmpeg.deleteFile('video.mp4');
      await ffmpeg.deleteFile('voice.wav');
      await ffmpeg.deleteFile('output.mp4');
    } catch (_) {}
    return blob;
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
