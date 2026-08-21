import { runProcess } from './process.js';
import { FfmpegError, renderError } from './errors.js';
import type {
  FfmpegConfiguration,
  FfprobeResult,
  FfprobeStream,
  MediaMetadata,
  ResolvedSettings,
} from './types.js';
import { formatDuration, gcd, parseRate, parseRatio } from './utils.js';

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function aliases(value: string): string[] {
  return value.split(',').filter(Boolean);
}

export async function inspectConfiguration(
  settings: ResolvedSettings,
): Promise<FfmpegConfiguration> {
  const [formatsResult, encodersResult] = await Promise.all([
    runProcess(settings.ffmpegPath, ['-hide_banner', '-formats'], settings, { stdout: 'full' }),
    runProcess(settings.ffmpegPath, ['-hide_banner', '-encoders'], settings, { stdout: 'full' }),
  ]);
  const formatsText = `${formatsResult.stdout}\n${formatsResult.stderr}`;
  const encodersText = `${encodersResult.stdout}\n${encodersResult.stderr}`;
  const decode: string[] = [];
  const encodeFormats: string[] = [];

  for (const line of formatsText.split(/\r?\n/)) {
    const match = /^\s([D. ])([E. ])\s+(\S+)/.exec(line);
    if (!match) continue;
    const names = aliases(match[3] ?? '');
    if (match[1] === 'D') decode.push(...names);
    if (match[2] === 'E') encodeFormats.push(...names);
  }

  const encoders: string[] = [];
  for (const line of encodersText.split(/\r?\n/)) {
    const match = /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line);
    if (match?.[1]) encoders.push(match[1]);
  }

  const configuration = /configuration:\s*(.+)/.exec(`${formatsText}\n${encodersText}`)?.[1] ?? '';
  const modules = [...configuration.matchAll(/--enable-([\w-]+)/g)].map((match) => match[1] ?? '');
  const formats = { encode: unique(encodeFormats), decode: unique(decode) };
  const codecs = { encode: unique(encoders) };
  return {
    modules: unique(modules),
    encode: unique([...formats.encode, ...codecs.encode, 'copy']),
    decode: formats.decode,
    formats,
    codecs,
  };
}

export async function probeMedia(
  input: string,
  settings: ResolvedSettings,
): Promise<MediaMetadata> {
  const result = await runProcess(
    settings.ffprobePath,
    [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      input,
    ],
    settings,
    { stdout: 'full' },
  );

  let raw: FfprobeResult;
  try {
    raw = JSON.parse(result.stdout) as FfprobeResult;
  } catch (cause) {
    const error = renderError('invalid_probe_output');
    throw new FfmpegError(error.code, error.message, { cause, stderr: result.stderr });
  }
  return toLegacyMetadata(input, raw);
}

function numeric(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function streamByType(raw: FfprobeResult, type: string): FfprobeStream | undefined {
  return raw.streams?.find((stream) => stream.codec_type === type);
}

function toRatio(value: string | undefined, width: number, height: number) {
  const parsed = parseRatio(value);
  const divisor = parsed ? 1 : gcd(width, height);
  const x = parsed?.x ?? (width > 0 ? width / divisor : 0);
  const y = parsed?.y ?? (height > 0 ? height / divisor : 0);
  return x > 0 && y > 0 ? { x, y, string: `${x}:${y}`, value: x / y } : {};
}

export function toLegacyMetadata(input: string, raw: FfprobeResult): MediaMetadata {
  const format = raw.format ?? {};
  const tags = format.tags ?? {};
  const video = streamByType(raw, 'video');
  const audio = streamByType(raw, 'audio');
  const width = video?.width ?? 0;
  const height = video?.height ?? 0;
  const pixelRatio = parseRatio(video?.sample_aspect_ratio);
  const pixel = pixelRatio?.value ?? (width > 0 ? 1 : 0);
  const resolutionSquare =
    width > 0 && height > 0 && pixel > 0
      ? pixel > 1
        ? { w: Math.round(width * pixel), h: height }
        : { w: width, h: Math.round(height / pixel) }
      : {};
  const seconds = numeric(format.duration);
  const rotation =
    numeric(video?.tags?.rotate) ||
    numeric(video?.side_data_list?.find((item) => item.rotation)?.rotation);
  const channelCount = audio?.channels ?? 0;

  return {
    filename: format.filename ?? input,
    title: tags.title ?? video?.tags?.title ?? '',
    artist: tags.artist ?? '',
    album: tags.album ?? '',
    track: tags.track ?? '',
    date: tags.date ?? tags.creation_time ?? '',
    synched: numeric(format.start_time ?? video?.start_time) === 0,
    duration: { raw: formatDuration(seconds), seconds },
    video: {
      container: (format.format_name ?? '').split(',')[0] ?? '',
      bitrate: Math.round(numeric(video?.bit_rate ?? format.bit_rate) / 1000),
      stream: video?.index ?? 0,
      codec: video?.codec_name ?? '',
      resolution: { w: width, h: height },
      resolutionSquare,
      aspect: toRatio(video?.display_aspect_ratio, width, height),
      rotate: rotation,
      fps: parseRate(video?.avg_frame_rate ?? video?.r_frame_rate),
      pixelString: video?.sample_aspect_ratio ?? (width > 0 ? '1:1' : ''),
      pixel,
    },
    audio: {
      codec: audio?.codec_name ?? '',
      bitrate: Math.round(numeric(audio?.bit_rate) / 1000),
      sample_rate: numeric(audio?.sample_rate),
      stream: audio?.index ?? 0,
      channels: {
        raw:
          audio?.channel_layout ??
          (channelCount === 2 ? 'stereo' : channelCount === 1 ? 'mono' : ''),
        value: channelCount,
      },
    },
    raw,
  };
}
