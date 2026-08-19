import { join, resolve } from 'node:path';
import type { FfmpegConfiguration, MediaMetadata, ResolvedSettings } from '../src/types.js';
import { Video } from '../src/video.js';

export const fixtures = resolve(import.meta.dirname, 'fixtures');
export const input = join(fixtures, 'input video.mp4');
export const watermark = join(fixtures, 'watermark.png');
export const fakeFfmpeg = join(fixtures, 'fake-ffmpeg.mjs');
export const fakeFfprobe = join(fixtures, 'fake-ffprobe.mjs');

export const settings: ResolvedSettings = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 16 * 1024 * 1024,
  overwrite: false,
  ffmpegPath: fakeFfmpeg,
  ffprobePath: fakeFfprobe,
};

export const configuration: FfmpegConfiguration = {
  modules: ['libmp3lame', 'libx264'],
  encode: ['aac', 'copy', 'libmp3lame', 'libx264', 'mjpeg', 'mp4'],
  decode: ['matroska', 'mov', 'webm'],
  formats: { encode: ['mp4'], decode: ['matroska', 'mov', 'webm'] },
  codecs: { encode: ['aac', 'libmp3lame', 'libx264', 'mjpeg'] },
};

export const metadata: MediaMetadata = {
  filename: input,
  title: 'Fixture',
  artist: 'node-ffmpeg',
  album: '',
  track: '',
  date: '',
  synched: true,
  duration: { raw: '00:00:10.50', seconds: 10.5 },
  video: {
    container: 'matroska',
    bitrate: 4000,
    stream: 0,
    codec: 'h264',
    resolution: { w: 1920, h: 1080 },
    resolutionSquare: { w: 1920, h: 1080 },
    aspect: { x: 16, y: 9, string: '16:9', value: 16 / 9 },
    rotate: 90,
    fps: 25,
    pixelString: '1:1',
    pixel: 1,
  },
  audio: {
    codec: 'aac',
    bitrate: 192,
    sample_rate: 48000,
    stream: 1,
    channels: { raw: 'stereo', value: 2 },
  },
  raw: {},
};

export function createVideo(overrides: Partial<ResolvedSettings> = {}): Video {
  return new Video(input, { ...settings, ...overrides }, configuration, structuredClone(metadata));
}
