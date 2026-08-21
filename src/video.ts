import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
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

interface FileFingerprint {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

export class ProgressStreamParser {
  private remainder = '';

  constructor(private readonly duration: number) {}

  write(chunk: string): Progress[] {
    const parts = `${this.remainder}${chunk}`.split(/\r\n|[\r\n]/);
    this.remainder = parts.pop() ?? '';
    if (this.remainder.length > 64 * 1024) this.remainder = this.remainder.slice(-64 * 1024);
    return parts
      .map((line) => parseProgress(line, this.duration))
      .filter((progress): progress is Progress => progress !== undefined);
  }

  flush(): Progress[] {
    const progress = parseProgress(this.remainder, this.duration);
    this.remainder = '';
    return progress ? [progress] : [];
  }
}

const positions = new Set(['NE', 'NC', 'NW', 'SE', 'SC', 'SW', 'C', 'CE', 'CW']);

function settle<T>(promise: Promise<T>, callback?: LegacyCallback<T>): Promise<T> | void {
  if (!callback) return promise;
  void promise.then(
    (value) => callback(null, value),
    (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
  );
}

function numericTime(value: string | number, name: string, allowZero: boolean): number {
  let validText = typeof value === 'number';
  if (typeof value === 'string') {
    validText = /^\d+(?:\.\d+)?$/.test(value);
    const clock = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
    if (clock) validText = Number(clock[2]) < 60 && Number(clock[3]) < 60;
  }
  const seconds = durationToSeconds(value);
  if (!validText || !Number.isFinite(seconds) || seconds < 0 || (!allowZero && seconds === 0)) {
    throw renderError('invalid_time', name, value);
  }
  return seconds;
}

function finiteNumber(value: string | number, name: string, minimum = 0): number {
  if (typeof value === 'string' && value.trim() === '') {
    throw renderError(
      'invalid_numeric_option',
      name,
      `a finite number greater than or equal to ${minimum}`,
    );
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum) {
    throw renderError(
      'invalid_numeric_option',
      name,
      `a finite number greater than or equal to ${minimum}`,
    );
  }
  return numeric;
}

function positiveNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw renderError('invalid_numeric_option', name, 'a finite number greater than 0');
  }
  return value;
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
    asBitrate(bitrate);
    (this.options.video ??= {}).bitrate = bitrate;
    return this;
  }

  setVideoFrameRate(framerate: number): this {
    (this.options.video ??= {}).framerate = positiveNumber(framerate, 'video frame rate');
    return this;
  }

  setVideoStartTime(time: string | number): this {
    (this.options.video ??= {}).startTime = numericTime(time, 'start time', true);
    return this;
  }

  setVideoDuration(duration: string | number): this {
    (this.options.video ??= {}).duration = numericTime(duration, 'duration', false);
    return this;
  }

  setVideoAspectRatio(aspect: string | number): this {
    let value: string | number;
    if (aspect === 'source') {
      value = this.metadata.video.aspect.string ?? '';
      if (!value) throw renderError('invalid_aspect_ratio', aspect);
    } else if (typeof aspect === 'string') {
      const match = /^(\d+):(\d+)$/.exec(aspect);
      if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
        throw renderError('invalid_aspect_ratio', aspect);
      }
      value = `${Number(match[1])}:${Number(match[2])}`;
    } else {
      if (!Number.isFinite(aspect) || aspect <= 0)
        throw renderError('invalid_aspect_ratio', aspect);
      value = aspect;
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
    (this.options.video ??= {}).quality = finiteNumber(quality, 'video quality');
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
    (this.options.audio ??= {}).frequency = positiveNumber(frequency, 'audio frequency');
    return this;
  }

  setAudioChannels(channels: number): this {
    if (!Number.isSafeInteger(channels) || channels <= 0) {
      throw renderError('audio_channel_is_invalid', channels);
    }
    (this.options.audio ??= {}).channels = channels;
    return this;
  }

  setAudioBitRate(bitrate: string | number): this {
    asBitrate(bitrate);
    (this.options.audio ??= {}).bitrate = bitrate;
    return this;
  }

  setAudioQuality(quality: string | number): this {
    (this.options.audio ??= {}).quality = finiteNumber(quality, 'audio quality');
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
    if (!Number.isFinite(threads) || threads < 0) {
      throw renderError(
        'invalid_numeric_option',
        'threads',
        'a finite number greater than or equal to 0',
      );
    }
    this.options.threads = Math.trunc(threads);
    return this;
  }

  setWatermark(watermarkPath: string, settings: WatermarkSettings = {}): this {
    if (!existsSync(watermarkPath)) throw renderError('invalid_watermark', watermarkPath);
    const position = settings.position ?? 'SW';
    if (!positions.has(position)) throw renderError('invalid_watermark_position', position);
    for (const [name, value] of [
      ['margin_nord', settings.margin_nord],
      ['margin_sud', settings.margin_sud],
      ['margin_east', settings.margin_east],
      ['margin_west', settings.margin_west],
    ] as const) {
      if (value !== undefined) finiteNumber(value, name);
    }
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
    const filters: string[] = [];
    if (video?.watermark) {
      const watermarkInput = allInputs.length;
      allInputs.push(video.watermark.path);
      filters.push(`[0:v][${watermarkInput}:v]overlay=${video.watermark.overlay}`);
    }
    for (const input of allInputs) args.push('-i', input);
    filters.push(...this.filtersComplex);

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
      (!Number.isFinite(settings.every_n_percentage) ||
        settings.every_n_percentage <= 0 ||
        settings.every_n_percentage > 100)
    ) {
      throw renderError('extract_frame_invalid_everyN_options');
    }
    for (const [name, value] of [
      ['every_n_frames', settings.every_n_frames],
      ['every_n_seconds', settings.every_n_seconds],
    ] as const) {
      if (value !== undefined && value !== null) positiveNumber(value, name);
    }
    if (
      settings.every_n_frames !== undefined &&
      settings.every_n_frames !== null &&
      !Number.isSafeInteger(settings.every_n_frames)
    ) {
      throw renderError('invalid_numeric_option', 'every_n_frames', 'a positive safe integer');
    }
    if (settings.frame_rate !== undefined && settings.frame_rate !== null) {
      positiveNumber(settings.frame_rate, 'frame_rate');
    }
    if (settings.number !== undefined && settings.number !== null) {
      if (!Number.isSafeInteger(settings.number) || settings.number <= 0) {
        throw renderError('invalid_numeric_option', 'number', 'a positive safe integer');
      }
    }
    if (settings.quality !== undefined) finiteNumber(settings.quality, 'quality');

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
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('%d', '\\d+');
    const matcher = new RegExp(`^${escaped}$`);
    const before = await frameFingerprints(destinationFolder, matcher);
    const args = [this.settings.overwrite ? '-y' : '-n', '-hide_banner'];
    if (settings.start_time !== undefined && settings.start_time !== null) {
      args.push('-ss', String(numericTime(settings.start_time, 'start_time', true)));
    }
    args.push('-i', this.file_path);
    if (settings.duration_time !== undefined && settings.duration_time !== null) {
      args.push('-t', String(numericTime(settings.duration_time, 'duration_time', false)));
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

    const after = await frameFingerprints(destinationFolder, matcher);
    return [...after.entries()]
      .filter(([entry, fingerprint]) => {
        const previous = before.get(entry);
        return (
          previous?.size !== fingerprint.size ||
          previous.mtimeMs !== fingerprint.mtimeMs ||
          previous.ctimeMs !== fingerprint.ctimeMs
        );
      })
      .map(([entry]) => entry)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((entry) => join(destinationFolder, entry));
  }

  private async execute(args: string[]): Promise<ProcessResult> {
    const command = this.settings.ffmpegPath;
    const display = displayCommand(command, args);
    const progressParser = new ProgressStreamParser(this.metadata.duration.seconds);
    const emitProgress = (progress: Progress): void => {
      this.emit('progress', progress);
    };
    this.emit('start', display);
    try {
      const result = await runProcess(command, args, this.settings, {
        onStderr: (chunk) => {
          this.emit('stderr', chunk);
          progressParser.write(chunk).forEach(emitProgress);
        },
      });
      progressParser.flush().forEach(emitProgress);
      this.emit('end', result);
      this.reset();
      return result;
    } catch (error) {
      progressParser.flush().forEach(emitProgress);
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

async function frameFingerprints(
  directory: string,
  matcher: RegExp,
): Promise<Map<string, FileFingerprint>> {
  const entries = (await readdir(directory)).filter((entry) => matcher.test(entry));
  const fingerprints = new Map<string, FileFingerprint>();
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const details = await stat(join(directory, entry));
        fingerprints.set(entry, {
          size: details.size,
          mtimeMs: details.mtimeMs,
          ctimeMs: details.ctimeMs,
        });
      } catch {
        // A concurrently removed file is not an output of this run.
      }
    }),
  );
  return fingerprints;
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
