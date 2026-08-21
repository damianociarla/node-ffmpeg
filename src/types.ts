export interface FfmpegSettings {
  /** Text encoding used for process output. Kept for compatibility. */
  encoding?: BufferEncoding;
  /** Maximum runtime in milliseconds. Zero disables the timeout. */
  timeout?: number;
  /** Maximum retained stdout/stderr bytes. Output is tailed, not used to kill FFmpeg. */
  maxBuffer?: number;
  /** FFmpeg executable. Defaults to `ffmpeg`. */
  ffmpegPath?: string;
  /** ffprobe executable. Inferred from ffmpegPath when possible. */
  ffprobePath?: string;
  /** Overwrite output files with `-y`. Defaults to false (`-n`). */
  overwrite?: boolean;
  /** Abort an active probe or conversion. */
  signal?: AbortSignal;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedSettings {
  encoding: BufferEncoding;
  timeout: number;
  maxBuffer: number;
  ffmpegPath: string;
  ffprobePath: string;
  overwrite: boolean;
  signal?: AbortSignal;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/** Settings that may vary for each media opened through an FfmpegClient. */
export type FfmpegOperationSettings = Pick<
  FfmpegSettings,
  'encoding' | 'timeout' | 'maxBuffer' | 'overwrite' | 'signal'
>;

export interface FfmpegConfiguration {
  modules: string[];
  /** Legacy union of writable formats and available encoders. */
  encode: string[];
  decode: string[];
  formats: {
    encode: string[];
    decode: string[];
  };
  codecs: {
    encode: string[];
  };
}

export interface Ratio {
  x: number;
  y: number;
  string: string;
  value: number;
}

export interface Resolution {
  w: number;
  h: number;
}

export interface MediaMetadata {
  filename: string;
  title: string;
  artist: string;
  album: string;
  track: string;
  date: string;
  synched: boolean;
  duration: {
    raw: string;
    seconds: number;
  };
  video: {
    container: string;
    bitrate: number;
    stream: number;
    codec: string;
    resolution: Resolution;
    resolutionSquare: Partial<Resolution>;
    aspect: Partial<Ratio>;
    rotate: number;
    fps: number;
    pixelString: string;
    pixel: number;
  };
  audio: {
    codec: string;
    bitrate: number;
    sample_rate: number;
    stream: number;
    channels: {
      raw: string;
      value: number;
    };
  };
  /** Original ffprobe response for advanced consumers. */
  raw: FfprobeResult;
}

export interface FfprobeStream {
  index?: number;
  codec_name?: string;
  codec_type?: string;
  width?: number;
  height?: number;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_aspect_ratio?: string;
  display_aspect_ratio?: string;
  start_time?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
  [key: string]: unknown;
}

export interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: {
    filename?: string;
    format_name?: string;
    duration?: string;
    start_time?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
    [key: string]: unknown;
  };
  chapters?: unknown[];
  [key: string]: unknown;
}

export interface WatermarkSettings {
  position?: 'NE' | 'NC' | 'NW' | 'SE' | 'SC' | 'SW' | 'C' | 'CE' | 'CW';
  margin_nord?: number;
  margin_sud?: number;
  margin_east?: number;
  margin_west?: number;
}

export interface ExtractFrameSettings {
  start_time?: string | number | null;
  duration_time?: string | number | null;
  frame_rate?: number | null;
  size?: string | null;
  number?: number | null;
  every_n_frames?: number | null;
  every_n_seconds?: number | null;
  every_n_percentage?: number | null;
  keep_pixel_aspect_ratio?: boolean;
  keep_aspect_ratio?: boolean;
  padding_color?: string;
  file_name?: string | null;
  quality?: number;
}

export interface Progress {
  frames?: number;
  fps?: number;
  time: number;
  speed?: number;
  percent?: number;
}

export type LegacyCallback<T> = (error: Error | null, result: T | null) => void;

export interface ProcessResult {
  command: string;
  args: string[];
  code: number;
  stdout: string;
  stderr: string;
}
