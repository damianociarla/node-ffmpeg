import { isAbsolute, join } from 'node:path';
import { renderError } from './errors.js';
import type { FfmpegSettings, ResolvedSettings } from './types.js';

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

  const ffmpegPath = settings.ffmpegPath ?? defaults.ffmpegPath;
  return {
    ...defaultSettings,
    ...settings,
    ffmpegPath,
    ffprobePath: settings.ffprobePath ?? inferFfprobePath(ffmpegPath, defaults.ffprobePath),
  };
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
  return /^[a-z][a-z\d+.-]*:\/\//i.test(input) || input === '-';
}

export function asBitrate(value: string | number): string {
  return typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(value) ? `${value}k` : value;
}
