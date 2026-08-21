import { existsSync } from 'node:fs';
import { inspectConfiguration, probeMedia } from './probe.js';
import { errors, FfmpegError, renderError } from './errors.js';
import { presets, sizes, ratios, audioChannels } from './presets.js';
import type {
  FfmpegConfiguration,
  FfmpegOperationSettings,
  FfmpegSettings,
  LegacyCallback,
  ResolvedSettings,
} from './types.js';
import { resolveSettings, resolveOperationSettings, isRemoteInput } from './utils.js';
import { parseProgress, Video } from './video.js';
import { runOwnedTasks } from './owned-tasks.js';

export * from './types.js';
export { FfmpegError, Video, errors, presets, sizes, ratios, audioChannels, parseProgress };

interface FfmpegFactory {
  (input: string, settings?: FfmpegSettings): Promise<Video>;
  (input: string, callback: LegacyCallback<Video>): void;
  (input: string, settings: FfmpegSettings, callback: LegacyCallback<Video>): void;
  new (input: string, settings?: FfmpegSettings): Promise<Video>;
  new (input: string, callback: LegacyCallback<Video>): object;
  new (input: string, settings: FfmpegSettings, callback: LegacyCallback<Video>): object;
  bin: string;
  ffprobeBin: string;
}

async function initializeVideo(input: string, settings: FfmpegSettings): Promise<Video> {
  const resolved = resolveSettings(settings, {
    ffmpegPath: ffmpeg.bin,
    ffprobePath: ffmpeg.ffprobeBin,
  });
  const [configuration, metadata] = await runOwnedTasks(resolved, [
    (ownedSettings) => inspectConfiguration(ownedSettings),
    (ownedSettings) => probeMedia(input, ownedSettings),
  ] as const);
  return new Video(input, resolved, configuration, metadata);
}

function validateInput(input: unknown): asserts input is string {
  if (input === undefined || input === null || input === '')
    throw renderError('empty_input_filepath');
  if (typeof input !== 'string') throw renderError('input_filepath_must_be_string');
  if (!isRemoteInput(input) && !existsSync(input)) throw renderError('fileinput_not_exist', input);
}

const factory = function (
  input: string,
  settingsOrCallback?: FfmpegSettings | LegacyCallback<Video>,
  maybeCallback?: LegacyCallback<Video>,
): Promise<Video> | void {
  validateInput(input);
  const callback = typeof settingsOrCallback === 'function' ? settingsOrCallback : maybeCallback;
  const settings = typeof settingsOrCallback === 'function' ? {} : (settingsOrCallback ?? {});
  const promise = initializeVideo(input, settings);
  if (!callback) return promise;
  void promise.then(
    (video) => callback(null, video),
    (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
  );
} as FfmpegFactory;

factory.bin = 'ffmpeg';
factory.ffprobeBin = 'ffprobe';

export const ffmpeg = factory;
export function create(input: string, settings: FfmpegSettings = {}): Promise<Video> {
  validateInput(input);
  return initializeVideo(input, settings);
}

export interface FfmpegClient {
  readonly configuration: FfmpegConfiguration;
  open(input: string, settings?: FfmpegOperationSettings): Promise<Video>;
}

class InstanceFfmpegClient implements FfmpegClient {
  private readonly baseSettings: ResolvedSettings;
  private readonly lifetimeSignal: AbortSignal | undefined;
  private readonly cachedConfiguration: FfmpegConfiguration;

  constructor(settings: ResolvedSettings, configuration: FfmpegConfiguration) {
    const { signal, ...baseSettings } = settings;
    this.lifetimeSignal = signal;
    this.baseSettings = {
      ...baseSettings,
      ...(settings.env ? { env: { ...settings.env } } : {}),
    };
    this.cachedConfiguration = structuredClone(configuration);
  }

  get configuration(): FfmpegConfiguration {
    return structuredClone(this.cachedConfiguration);
  }

  open(input: string, settings: FfmpegOperationSettings = {}): Promise<Video> {
    validateInput(input);
    const resolved = resolveOperationSettings(settings, this.baseSettings);
    const signals = [this.lifetimeSignal, resolved.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    if (signal) resolved.signal = signal;
    else delete resolved.signal;
    return probeMedia(input, resolved).then(
      (metadata) => new Video(input, resolved, structuredClone(this.cachedConfiguration), metadata),
    );
  }
}

export async function createClient(settings: FfmpegSettings = {}): Promise<FfmpegClient> {
  const resolved = resolveSettings(settings, {
    ffmpegPath: ffmpeg.bin,
    ffprobePath: ffmpeg.ffprobeBin,
  });
  const configuration = await inspectConfiguration(resolved);
  return new InstanceFfmpegClient(resolved, configuration);
}
export default ffmpeg;
