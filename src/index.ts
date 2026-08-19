import { existsSync } from 'node:fs';
import { inspectConfiguration, probeMedia } from './probe.js';
import { errors, FfmpegError, renderError } from './errors.js';
import { presets, sizes, ratios, audioChannels } from './presets.js';
import type { FfmpegSettings, LegacyCallback } from './types.js';
import { resolveSettings, isRemoteInput } from './utils.js';
import { parseProgress, Video } from './video.js';

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

const configurationCache = new Map<string, ReturnType<typeof inspectConfiguration>>();

async function createVideo(input: string, settings: FfmpegSettings = {}): Promise<Video> {
  const resolved = resolveSettings(settings, {
    ffmpegPath: ffmpeg.bin,
    ffprobePath: ffmpeg.ffprobeBin,
  });
  let configurationPromise = configurationCache.get(resolved.ffmpegPath);
  if (!configurationPromise) {
    configurationPromise = inspectConfiguration(resolved);
    configurationCache.set(resolved.ffmpegPath, configurationPromise);
    void configurationPromise.catch(() => configurationCache.delete(resolved.ffmpegPath));
  }
  const [configuration, metadata] = await Promise.all([
    configurationPromise,
    probeMedia(input, resolved),
  ]);
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
  const promise = createVideo(input, settings);
  if (!callback) return promise;
  void promise.then(
    (video) => callback(null, video),
    (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
  );
} as FfmpegFactory;

factory.bin = 'ffmpeg';
factory.ffprobeBin = 'ffprobe';

export const ffmpeg = factory;
export const create = createVideo;
export default ffmpeg;
