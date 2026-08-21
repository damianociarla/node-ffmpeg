import { isAbsolute, join } from 'node:path';
import { renderError } from './errors.js';
import type { FfmpegOperationSettings, FfmpegSettings, ResolvedSettings } from './types.js';

const defaultSettings = {
  encoding: 'utf8',
  timeout: 0,
  maxBuffer: 16 * 1024 * 1024,
  overwrite: false,
} as const;

export function resolveSettings(
  settings: FfmpegSettings = {},
  defaults: { ffmpegPath: string; ffprobePath: string },
): ResolvedSettings {
  const rawSettings: unknown = settings;
  if (rawSettings === null || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    throw renderError('invalid_option_value', 'settings');
  }
  const valid = new Set([
    'encoding',
    'timeout',
    'maxBuffer',
    'ffmpegPath',
    'ffprobePath',
    'overwrite',
    'signal',
    'cwd',
    'env',
  ]);
  for (const key of Object.keys(settings)) {
    if (!valid.has(key)) throw renderError('invalid_option_name', key);
  }

  if (!Buffer.isEncoding(settings.encoding ?? defaultSettings.encoding)) {
    throw renderError('invalid_option_value', 'encoding');
  }
  if (
    settings.timeout !== undefined &&
    (!Number.isFinite(settings.timeout) || settings.timeout < 0)
  ) {
    throw renderError(
      'invalid_numeric_option',
      'timeout',
      'a finite number greater than or equal to 0',
    );
  }
  if (
    settings.maxBuffer !== undefined &&
    (!Number.isSafeInteger(settings.maxBuffer) || settings.maxBuffer <= 0)
  ) {
    throw renderError('invalid_numeric_option', 'maxBuffer', 'a positive safe integer');
  }
  for (const [name, value] of [
    ['ffmpegPath', settings.ffmpegPath],
    ['ffprobePath', settings.ffprobePath],
  ] as const) {
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
      throw renderError('invalid_option_value', name);
    }
  }
  if (settings.overwrite !== undefined && typeof settings.overwrite !== 'boolean') {
    throw renderError('invalid_option_value', 'overwrite');
  }
  if (settings.cwd !== undefined && (typeof settings.cwd !== 'string' || settings.cwd === '')) {
    throw renderError('invalid_option_value', 'cwd');
  }
  const rawEnvironment = (settings as { env?: unknown }).env;
  if (
    rawEnvironment !== undefined &&
    (rawEnvironment === null || typeof rawEnvironment !== 'object' || Array.isArray(rawEnvironment))
  ) {
    throw renderError('invalid_option_value', 'env');
  }
  const rawSignal: unknown = settings.signal;
  if (
    rawSignal !== undefined &&
    (!(rawSignal instanceof AbortSignal) ||
      typeof rawSignal.aborted !== 'boolean' ||
      typeof rawSignal.addEventListener !== 'function' ||
      typeof rawSignal.removeEventListener !== 'function')
  ) {
    throw renderError('invalid_option_value', 'signal');
  }

  const ffmpegPath = settings.ffmpegPath ?? defaults.ffmpegPath;
  return {
    ...defaultSettings,
    ...settings,
    ffmpegPath,
    ffprobePath: settings.ffprobePath ?? inferFfprobePath(ffmpegPath, defaults.ffprobePath),
  };
}

export function resolveOperationSettings(
  settings: FfmpegOperationSettings = {},
  defaults: ResolvedSettings,
): ResolvedSettings {
  const rawSettings: unknown = settings;
  if (rawSettings === null || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    throw renderError('invalid_option_value', 'settings');
  }
  const valid = new Set(['encoding', 'timeout', 'maxBuffer', 'overwrite', 'signal']);
  for (const key of Object.keys(settings)) {
    if (!valid.has(key)) throw renderError('invalid_option_name', key);
  }
  const merged: FfmpegSettings = {
    ...defaults,
    ...settings,
    ffmpegPath: defaults.ffmpegPath,
    ffprobePath: defaults.ffprobePath,
  };
  if (defaults.cwd === undefined) delete merged.cwd;
  else merged.cwd = defaults.cwd;
  if (defaults.env === undefined) delete merged.env;
  else merged.env = defaults.env;
  return resolveSettings(merged, {
    ffmpegPath: defaults.ffmpegPath,
    ffprobePath: defaults.ffprobePath,
  });
}

function inferFfprobePath(ffmpegPath: string, fallback: string): string {
  if (fallback !== 'ffprobe') return fallback;
  if (!isAbsolute(ffmpegPath)) return fallback;
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return join(ffmpegPath, '..', `ffprobe${suffix}`);
}

export function durationToSeconds(duration: string | number): number {
  if (typeof duration === 'number') return Number.isFinite(duration) ? duration : 0;
  if (/^\d+(?:\.\d+)?$/.test(duration)) return Number(duration);
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(duration);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remaining
    .toFixed(2)
    .padStart(5, '0')}`;
}

export function gcd(a: number, b: number): number {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right !== 0) [left, right] = [right, left % right];
  return left || 1;
}

export function parseRatio(value?: string): { x: number; y: number; value: number } | undefined {
  if (!value || value === 'N/A' || value === '0:1') return undefined;
  const match = /^(\d+):(\d+)$/.exec(value);
  if (!match || Number(match[2]) === 0) return undefined;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return { x, y, value: x / y };
}

export function parseRate(value?: string): number {
  if (!value) return 0;
  const [numerator = '0', denominator = '1'] = value.split('/');
  const divisor = Number(denominator);
  return divisor === 0 ? 0 : Number(numerator) / divisor;
}

export function quoteForDisplay(value: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : JSON.stringify(value);
}

export function isRemoteInput(input: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(input);
}

export function assertSafeOutput(value: unknown, name = 'destination'): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw renderError('invalid_option_value', name);
  }
  if (value.startsWith('-')) throw renderError('unsafe_output_path', value);
}

export function ffmpegColor(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw renderError('invalid_color', String(value));
  }
  const [color, alpha, extra] = value.split('@');
  const validColor =
    /^[A-Za-z]+$/.test(color ?? '') ||
    /^(?:(?:0x|#)?[\dA-Fa-f]{6}(?:[\dA-Fa-f]{2})?)$/.test(color ?? '');
  const validAlpha =
    alpha === undefined ||
    /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(alpha) ||
    /^0x[\dA-Fa-f]{2}$/.test(alpha);
  if (!validColor || !validAlpha || extra !== undefined) throw renderError('invalid_color', value);
  return value;
}

export function asBitrate(value: string | number): string {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?(?:[kKmMgG])?$/.test(text) || Number.parseFloat(text) <= 0) {
    throw renderError(
      'invalid_numeric_option',
      'bitrate',
      'a positive number with an optional K, M, or G suffix',
    );
  }
  return /^\d+(?:\.\d+)?$/.test(text) ? `${text}k` : text;
}
