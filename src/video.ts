import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { renderError } from './errors.js';
import { displayCommand, runProcess } from './process.js';
import type {
  ExtractFrameSettings,
  FfmpegConfiguration,
  LegacyCallback,
  MediaMetadata,
  ProcessResult,
  Progress,
  ResolvedSettings,
  WatermarkSettings,
} from './types.js';
import { asBitrate, durationToSeconds, gcd } from './utils.js';

interface VideoOptions {
  audio?: {
    disabled?: boolean;
    codec?: string;
    frequency?: number;
    channels?: number;
    bitrate?: string | number;
    quality?: string | number;
  };
  video?: {
    disabled?: boolean;
    format?: string;
    codec?: string;
    bitrate?: string | number;
    framerate?: number;
    startTime?: number;
    duration?: number;
    aspect?: number | string;
    size?: string;
    keepPixelAspectRatio?: boolean;
    keepAspectRatio?: boolean;
    paddingColor?: string;
    quality?: string | number;
    watermark?: { path: string; overlay: string };
  };
  metadata?: Record<string, string | number>;
  threads?: number;
}

interface Dimension {
  width: number;
  height: number;
  aspect?: { x: number; y: number; string: string };
}

interface VideoEvents {
  start: [command: string];
  progress: [progress: Progress];
  stderr: [chunk: string];
  end: [result: ProcessResult];
  error: [error: unknown];
}

const positions = new Set(['NE', 'NC', 'NW', 'SE', 'SC', 'SW', 'C', 'CE', 'CW']);

function settle<T>(promise: Promise<T>, callback?: LegacyCallback<T>): Promise<T> | void {
  if (!callback) return promise;
  void promise.then(
    (value) => callback(null, value),
    (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
  );
}

function numericTime(value: string | number): number {
  return durationToSeconds(value);
}

export class Video extends EventEmitter<VideoEvents> {
  readonly file_path: string;
  readonly info_configuration: FfmpegConfiguration;
  readonly metadata: MediaMetadata;

  private commands: string[] = [];
  private inputs: string[];
  private filtersComplex: string[] = [];
  private options: VideoOptions = {};

  constructor(
    filePath: string,
    private readonly settings: ResolvedSettings,
    configuration: FfmpegConfiguration,
    metadata: MediaMetadata,
  ) {
    super();
    this.file_path = filePath;
    this.inputs = [filePath];
    this.info_configuration = configuration;
    this.metadata = metadata;
  }

  addCommand(command: string, argument?: string | number): this {
    this.commands.push(command);
    if (argument !== undefined) this.commands.push(String(argument));
    return this;
  }

  /** Alias that better describes arbitrary modern FFmpeg arguments. */
  addOutputOption(command: string, argument?: string | number): this {
    return this.addCommand(command, argument);
  }

  addInput(input: string): this {
    this.inputs.push(input);
    return this;
  }

  addFilterComplex(filter: string): this {
    this.filtersComplex.push(filter);
    return this;
  }

  setDisableAudio(): this {
    (this.options.audio ??= {}).disabled = true;
    return this;
  }

  setDisableVideo(): this {
    (this.options.video ??= {}).disabled = true;
    return this;
  }

  setVideoFormat(format: string): this {
    if (!this.info_configuration.formats.encode.includes(format)) {
      throw renderError('format_not_supported', format);
    }
    (this.options.video ??= {}).format = format;
    return this;
  }

  setVideoCodec(codec: string): this {
    if (codec !== 'copy' && !this.info_configuration.codecs.encode.includes(codec)) {
      throw renderError('codec_not_supported', codec);
    }
    (this.options.video ??= {}).codec = codec;
    return this;
  }

  setVideoBitRate(bitrate: string | number): this {
    (this.options.video ??= {}).bitrate = bitrate;
    return this;
  }

  setVideoFrameRate(framerate: number): this {
    (this.options.video ??= {}).framerate = framerate;
    return this;
  }

  setVideoStartTime(time: string | number): this {
    (this.options.video ??= {}).startTime = numericTime(time);
    return this;
  }

  setVideoDuration(duration: string | number): this {
    (this.options.video ??= {}).duration = numericTime(duration);
    return this;
  }

  setVideoAspectRatio(aspect: string | number): this {
    let value: string | number = aspect;
    if (typeof aspect === 'string') {
      const match = /^(\d+):(\d+)$/.exec(aspect);
      value = match
        ? `${Number(match[1])}:${Number(match[2])}`
        : (this.metadata.video.aspect.string ?? aspect);
    }
    (this.options.video ??= {}).aspect = value;
    return this;
  }

  setVideoSize(
    size: string,
    keepPixelAspectRatio = false,
    keepAspectRatio = false,
    paddingColor = 'black',
  ): this {
    Object.assign((this.options.video ??= {}), {
      size,
      keepPixelAspectRatio,
      keepAspectRatio,
      paddingColor,
    });
    return this;
  }

  setVideoQuality(quality: string | number): this {
    (this.options.video ??= {}).quality = quality;
    return this;
  }

  setAudioCodec(codec: string): this {
    const resolvedCodec =
      codec === 'mp3' && this.info_configuration.codecs.encode.includes('libmp3lame')
        ? 'libmp3lame'
        : codec;
    if (
      resolvedCodec !== 'copy' &&
      !this.info_configuration.codecs.encode.includes(resolvedCodec)
    ) {
      throw renderError('codec_not_supported', codec);
    }
    (this.options.audio ??= {}).codec = resolvedCodec;
    return this;
  }

  setAudioFrequency(frequency: number): this {
    (this.options.audio ??= {}).frequency = frequency;
    return this;
  }

  setAudioChannels(channels: number): this {
    if (channels !== 1 && channels !== 2) throw renderError('audio_channel_is_invalid', channels);
    (this.options.audio ??= {}).channels = channels;
    return this;
  }

  setAudioBitRate(bitrate: string | number): this {
    (this.options.audio ??= {}).bitrate = bitrate;
    return this;
  }

  setAudioQuality(quality: string | number): this {
    (this.options.audio ??= {}).quality = quality;
    return this;
  }

  setMetadata(key: string, value: string | number): this;
  setMetadata(values: Record<string, string | number>): this;
  setMetadata(
    keyOrValues: string | Record<string, string | number>,
    value?: string | number,
  ): this {
    const values = typeof keyOrValues === 'string' ? { [keyOrValues]: value ?? '' } : keyOrValues;
    Object.assign((this.options.metadata ??= {}), values);
    return this;
  }

  setThreads(threads: number): this {
    this.options.threads = Math.max(0, Math.trunc(threads));
    return this;
  }

  setWatermark(watermarkPath: string, settings: WatermarkSettings = {}): this {
    if (!existsSync(watermarkPath)) throw renderError('invalid_watermark', watermarkPath);
    const position = settings.position ?? 'SW';
    if (!positions.has(position)) throw renderError('invalid_watermark_position', position);
    (this.options.video ??= {}).watermark = {
      path: watermarkPath,
      overlay: watermarkOverlay(position, settings),
    };
    return this;
  }

  getCommand(destination: string): { command: string; args: string[]; display: string } {
    const args = this.buildArgs(destination);
    return {
      command: this.settings.ffmpegPath,
      args,
      display: displayCommand(this.settings.ffmpegPath, args),
    };
  }

  save(destination: string): Promise<string>;
  save(destination: string, callback: LegacyCallback<string>): void;
  save(destination: string, callback?: LegacyCallback<string>): Promise<string> | void {
    return settle(
      this.execute(this.buildArgs(destination)).then(() => destination),
      callback,
    );
  }

  fnExtractSoundToMP3(destination: string): Promise<string>;
  fnExtractSoundToMP3(destination: string, callback: LegacyCallback<string>): void;
  fnExtractSoundToMP3(
    destination: string,
    callback?: LegacyCallback<string>,
  ): Promise<string> | void {
    const extension =
      extname(destination).toLowerCase() === '.mp3'
        ? destination
        : join(dirname(destination), `${basename(destination, extname(destination))}.mp3`);
    const args = [
      this.settings.overwrite ? '-y' : '-n',
      '-hide_banner',
      '-i',
      this.file_path,
      '-vn',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-b:a',
      '192k',
      '-c:a',
      'libmp3lame',
      extension,
    ];
    return settle(
      this.execute(args).then(() => extension),
      callback,
    );
  }

  fnExtractFrameToJPG(destinationFolder: string): Promise<string[]>;
  fnExtractFrameToJPG(destinationFolder: string, settings: ExtractFrameSettings): Promise<string[]>;
  fnExtractFrameToJPG(destinationFolder: string, callback: LegacyCallback<string[]>): void;
  fnExtractFrameToJPG(
    destinationFolder: string,
    settings: ExtractFrameSettings,
    callback: LegacyCallback<string[]>,
  ): void;
  fnExtractFrameToJPG(
    destinationFolder: string,
    settingsOrCallback: ExtractFrameSettings | LegacyCallback<string[]> = {},
    maybeCallback?: LegacyCallback<string[]>,
  ): Promise<string[]> | void {
    const callback = typeof settingsOrCallback === 'function' ? settingsOrCallback : maybeCallback;
    const settings = typeof settingsOrCallback === 'function' ? {} : settingsOrCallback;
    return settle(this.extractFrames(destinationFolder, settings), callback);
  }

  fnAddWatermark(watermarkPath: string): Promise<string>;
  fnAddWatermark(watermarkPath: string, callback: LegacyCallback<string>): void;
  fnAddWatermark(watermarkPath: string, settings: WatermarkSettings): Promise<string>;
  fnAddWatermark(
    watermarkPath: string,
    settings: WatermarkSettings,
    callback: LegacyCallback<string>,
  ): void;
  fnAddWatermark(watermarkPath: string, destination: string): Promise<string>;
  fnAddWatermark(
    watermarkPath: string,
    destination: string,
    settings: WatermarkSettings,
  ): Promise<string>;
  fnAddWatermark(
    watermarkPath: string,
    destination: string,
    settings: WatermarkSettings,
    callback: LegacyCallback<string>,
  ): void;
  fnAddWatermark(
    watermarkPath: string,
    ...args: Array<string | WatermarkSettings | LegacyCallback<string>>
  ): Promise<string> | void {
    let destination: string | undefined;
    let watermarkSettings: WatermarkSettings = {};
    let callback: LegacyCallback<string> | undefined;
    for (const argument of args) {
      if (typeof argument === 'string') destination = argument;
      else if (typeof argument === 'function') callback = argument;
      else watermarkSettings = argument;
    }
    destination ??= join(
      dirname(this.file_path),
      `${basename(this.file_path, extname(this.file_path))}_watermark_${basename(
        watermarkPath,
        extname(watermarkPath),
      )}${extname(this.file_path)}`,
    );
    this.setWatermark(watermarkPath, watermarkSettings);
    return settle(
      this.execute(this.buildArgs(destination)).then(() => destination),
      callback,
    );
  }

  private buildArgs(destination: string): string[] {
    const args = [this.settings.overwrite ? '-y' : '-n', '-hide_banner'];
    const video = this.options.video;
    const audio = this.options.audio;
    const allInputs = [...this.inputs];
    if (video?.watermark) allInputs.push(video.watermark.path);
    for (const input of allInputs) args.push('-i', input);
    const filters = [...this.filtersComplex];

    if (video?.disabled) args.push('-vn');
    else if (video) {
      if (video.format) args.push('-f', video.format);
      if (video.codec) args.push('-c:v', video.codec);
      if (video.bitrate !== undefined) args.push('-b:v', asBitrate(video.bitrate));
      if (video.framerate !== undefined) args.push('-r', String(video.framerate));
      if (video.startTime !== undefined) args.push('-ss', String(video.startTime));
      if (video.duration !== undefined) args.push('-t', String(video.duration));
      if (video.aspect !== undefined) args.push('-aspect', String(video.aspect));
      if (video.quality !== undefined) args.push('-q:v', String(video.quality));
      if (video.watermark) {
        filters.push(`overlay=${video.watermark.overlay}`);
      }
      if (video.size) {
        const dimension = this.calculateDimension(video);
        args.push('-s', `${dimension.width}x${dimension.height}`);
        if (dimension.aspect) {
          filters.push(
            `scale=iw*sar:ih,pad=max(iw\\,ih*(${dimension.aspect.x}/${dimension.aspect.y})):` +
              `ow/(${dimension.aspect.x}/${dimension.aspect.y}):(ow-iw)/2:(oh-ih)/2:${video.paddingColor ?? 'black'}`,
          );
          args.push('-aspect', dimension.aspect.string);
        }
      }
    }

    if (audio?.disabled) args.push('-an');
    else if (audio) {
      if (audio.codec) args.push('-c:a', audio.codec);
      if (audio.frequency !== undefined) args.push('-ar', String(audio.frequency));
      if (audio.channels !== undefined) args.push('-ac', String(audio.channels));
      if (audio.quality !== undefined) args.push('-q:a', String(audio.quality));
      if (audio.bitrate !== undefined) args.push('-b:a', asBitrate(audio.bitrate));
    }
    if (this.options.threads !== undefined) args.push('-threads', String(this.options.threads));
    for (const [key, value] of Object.entries(this.options.metadata ?? {})) {
      args.push('-metadata', `${key}=${value}`);
    }
    args.push(...this.commands);
    if (filters.length > 0) args.push('-filter_complex', filters.join(','));
    args.push(destination);
    return args;
  }

  private calculateDimension(video: NonNullable<VideoOptions['video']>): Dimension {
    const size = video.size ?? '';
    const source = video.keepPixelAspectRatio
      ? this.metadata.video.resolutionSquare
      : this.metadata.video.resolution;
    if (!('w' in source) || !('h' in source) || !source.w || !source.h) {
      throw renderError('resolution_square_not_defined');
    }
    let width = 0;
    let height = 0;
    let match: RegExpExecArray | null;
    if ((match = /^(\d+)x\?$/.exec(size))) {
      width = Number(match[1]);
      height = Math.round((width * source.h) / source.w);
    } else if ((match = /^\?x(\d+)$/.exec(size))) {
      height = Number(match[1]);
      width = Math.round((height * source.w) / source.h);
    } else if ((match = /^(\d+(?:\.\d+)?)%$/.exec(size))) {
      const scale = Number(match[1]) / 100;
      width = Math.round(source.w * scale);
      height = Math.round(source.h * scale);
    } else if ((match = /^(\d+)x(\d+)$/.exec(size))) {
      width = Number(match[1]);
      height = Number(match[2]);
    } else {
      throw renderError('size_format', size);
    }
    width = Math.max(2, width - (width % 2));
    height = Math.max(2, height - (height % 2));
    if (!video.keepAspectRatio) return { width, height };
    const divisor = gcd(width, height);
    const x = width / divisor;
    const y = height / divisor;
    return { width, height, aspect: { x, y, string: `${x}:${y}` } };
  }

  private async extractFrames(
    destinationFolder: string,
    settings: ExtractFrameSettings,
  ): Promise<string[]> {
    const selectors = [
      settings.every_n_frames,
      settings.every_n_seconds,
      settings.every_n_percentage,
    ].filter((value) => value !== undefined && value !== null);
    if (selectors.length > 1) throw renderError('extract_frame_invalid_everyN_options');
    if (
      settings.every_n_percentage !== undefined &&
      settings.every_n_percentage !== null &&
      (settings.every_n_percentage <= 0 || settings.every_n_percentage > 100)
    ) {
      throw renderError('extract_frame_invalid_everyN_options');
    }

    await mkdir(destinationFolder, { recursive: true });
    const size =
      settings.size ?? `${this.metadata.video.resolution.w}x${this.metadata.video.resolution.h}`;
    let fileName = settings.file_name ?? basename(this.file_path, extname(this.file_path));
    fileName = fileName
      .replaceAll('%t', String(Date.now()))
      .replaceAll('%s', size)
      .replaceAll('%x', size.split('x')[0] ?? '')
      .replaceAll('%y', size.split('x')[1] ?? '')
      .replace(/%[a-z]/gi, '');
    fileName = `${basename(fileName, extname(fileName))}_%d.jpg`;
    const outputPattern = join(destinationFolder, fileName);
    const args = [this.settings.overwrite ? '-y' : '-n', '-hide_banner'];
    if (settings.start_time !== undefined && settings.start_time !== null) {
      args.push('-ss', String(numericTime(settings.start_time)));
    }
    args.push('-i', this.file_path);
    if (settings.duration_time !== undefined && settings.duration_time !== null) {
      args.push('-t', String(numericTime(settings.duration_time)));
    }
    if (settings.frame_rate !== undefined && settings.frame_rate !== null) {
      args.push('-r', String(settings.frame_rate));
    }

    const temporaryVideo = this.options.video;
    this.options.video = {
      size,
      keepPixelAspectRatio: settings.keep_pixel_aspect_ratio ?? true,
      keepAspectRatio: settings.keep_aspect_ratio ?? true,
      paddingColor: settings.padding_color ?? 'black',
    };
    const dimension = this.calculateDimension(this.options.video);
    if (temporaryVideo) this.options.video = temporaryVideo;
    else delete this.options.video;
    args.push('-s', `${dimension.width}x${dimension.height}`);
    const filters: string[] = [];
    if (settings.every_n_frames) filters.push(`select=not(mod(n\\,${settings.every_n_frames}))`);
    if (settings.every_n_seconds) filters.push(`select=not(mod(t\\,${settings.every_n_seconds}))`);
    if (settings.every_n_percentage) {
      const interval = (this.metadata.duration.seconds * settings.every_n_percentage) / 100;
      filters.push(`select=not(mod(t\\,${interval}))`);
    }
    if (filters.length > 0) args.push('-vf', filters.join(','), '-fps_mode', 'vfr');
    if (settings.number) args.push('-frames:v', String(settings.number));
    args.push('-q:v', String(settings.quality ?? 2), outputPattern);
    await this.execute(args);

    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('%d', '\\d+');
    const matcher = new RegExp(`^${escaped}$`);
    return (await readdir(destinationFolder))
      .filter((entry) => matcher.test(entry))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((entry) => join(destinationFolder, entry));
  }

  private async execute(args: string[]): Promise<ProcessResult> {
    const command = this.settings.ffmpegPath;
    const display = displayCommand(command, args);
    this.emit('start', display);
    try {
      const result = await runProcess(command, args, this.settings, {
        onStderr: (chunk) => {
          this.emit('stderr', chunk);
          const progress = parseProgress(chunk, this.metadata.duration.seconds);
          if (progress) this.emit('progress', progress);
        },
      });
      this.emit('end', result);
      this.reset();
      return result;
    } catch (error) {
      if (this.listenerCount('error') > 0) this.emit('error', error);
      this.reset();
      throw error;
    }
  }

  private reset(): void {
    this.commands = [];
    this.inputs = [this.file_path];
    this.filtersComplex = [];
    this.options = {};
  }
}

function watermarkOverlay(position: string, settings: WatermarkSettings): string {
  const north = Number(settings.margin_nord ?? 0);
  const south = Number(settings.margin_sud ?? 0);
  const east = Number(settings.margin_east ?? 0);
  const west = Number(settings.margin_west ?? 0);
  const left = String(west);
  const center = '(main_w-overlay_w)/2';
  const right = `main_w-overlay_w-${east}`;
  const top = String(north);
  const middle = '(main_h-overlay_h)/2';
  const bottom = `main_h-overlay_h-${south}`;
  const coordinates: Record<string, [string, string]> = {
    NW: [left, top],
    NC: [center, top],
    NE: [right, top],
    CW: [left, middle],
    C: [center, middle],
    CE: [right, middle],
    SW: [left, bottom],
    SC: [center, bottom],
    SE: [right, bottom],
  };
  return (coordinates[position] ?? coordinates.SW ?? ['0', 'main_h-overlay_h']).join(':');
}

export function parseProgress(chunk: string, duration: number): Progress | undefined {
  const timeMatch = /time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(chunk);
  if (!timeMatch) return undefined;
  const time = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
  const frames = /frame=\s*(\d+)/.exec(chunk)?.[1];
  const fps = /fps=\s*([\d.]+)/.exec(chunk)?.[1];
  const speed = /speed=\s*([\d.]+)x/.exec(chunk)?.[1];
  const progress: Progress = { time };
  if (frames) progress.frames = Number(frames);
  if (fps) progress.fps = Number(fps);
  if (speed) progress.speed = Number(speed);
  if (duration > 0) progress.percent = Math.min(100, (time / duration) * 100);
  return progress;
}
