import { describe, expect, it } from 'vitest';
import {
  asBitrate,
  durationToSeconds,
  formatDuration,
  gcd,
  isRemoteInput,
  parseRate,
  parseRatio,
  quoteForDisplay,
  resolveSettings,
} from '../src/utils.js';

describe('settings resolution', () => {
  const defaults = { ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe' };

  it('provides safe defaults', () => {
    expect(resolveSettings({}, defaults)).toEqual({
      encoding: 'utf8',
      timeout: 0,
      maxBuffer: 16 * 1024 * 1024,
      overwrite: false,
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
    });
  });

  it('keeps every supported override', () => {
    const controller = new AbortController();
    const env = { TEST: 'yes' };
    expect(
      resolveSettings(
        {
          encoding: 'ascii',
          timeout: 42,
          maxBuffer: 99,
          overwrite: true,
          ffmpegPath: '/opt/bin/ffmpeg',
          ffprobePath: '/custom/ffprobe',
          cwd: '/tmp',
          env,
          signal: controller.signal,
        },
        defaults,
      ),
    ).toMatchObject({
      encoding: 'ascii',
      timeout: 42,
      maxBuffer: 99,
      overwrite: true,
      ffmpegPath: '/opt/bin/ffmpeg',
      ffprobePath: '/custom/ffprobe',
      cwd: '/tmp',
      env,
      signal: controller.signal,
    });
  });

  it('infers a sibling ffprobe for an absolute ffmpeg path', () => {
    expect(resolveSettings({ ffmpegPath: '/opt/media/ffmpeg' }, defaults).ffprobePath).toBe(
      '/opt/media/ffprobe',
    );
  });

  it('does not override an explicitly configured default ffprobe', () => {
    expect(
      resolveSettings(
        { ffmpegPath: '/opt/media/ffmpeg' },
        { ...defaults, ffprobePath: '/bin/probe' },
      ).ffprobePath,
    ).toBe('/bin/probe');
  });

  it('rejects unknown settings', () => {
    expect(() => resolveSettings({ legacyShell: true } as never, defaults)).toThrow(
      expect.objectContaining({ code: 102 }),
    );
  });
});

describe('time helpers', () => {
  it.each([
    [12, 12],
    [Number.POSITIVE_INFINITY, 0],
    ['12', 12],
    ['12.75', 12.75],
    ['01:02:03.50', 3723.5],
    ['invalid', 0],
    ['1:2:3', 0],
  ] as const)('converts %s to seconds', (value, expected) => {
    expect(durationToSeconds(value)).toBe(expected);
  });

  it.each([
    [0, '00:00:00.00'],
    [65.5, '00:01:05.50'],
    [3723.125, '01:02:03.13'],
    [-1, ''],
    [Number.NaN, ''],
  ] as const)('formats %s', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });
});

describe('numeric and media parsing helpers', () => {
  it.each([
    [8, 12, 4],
    [-8, 12, 4],
    [0, 0, 1],
    [7.9, 3.2, 1],
  ])('calculates gcd(%s, %s)', (left, right, expected) => {
    expect(gcd(left, right)).toBe(expected);
  });

  it('parses valid ratios and rejects sentinel values', () => {
    expect(parseRatio('16:9')).toEqual({ x: 16, y: 9, value: 16 / 9 });
    expect(parseRatio()).toBeUndefined();
    expect(parseRatio('N/A')).toBeUndefined();
    expect(parseRatio('0:1')).toBeUndefined();
    expect(parseRatio('1:0')).toBeUndefined();
    expect(parseRatio('wide')).toBeUndefined();
  });

  it.each([
    ['25/1', 25],
    ['30000/1001', 30000 / 1001],
    ['10/0', 0],
    ['', 0],
  ])('parses rate %s', (value, expected) => {
    expect(parseRate(value)).toBe(expected);
  });
});

describe('command helpers', () => {
  it.each([
    ['plain/path.mp4', 'plain/path.mp4'],
    ['metadata=hello', 'metadata=hello'],
    ['a path/video.mp4', '"a path/video.mp4"'],
    ['say "hello"', '"say \\"hello\\""'],
  ])('quotes %s only when needed', (value, expected) => {
    expect(quoteForDisplay(value)).toBe(expected);
  });

  it.each([
    ['https://example.com/video.mp4', true],
    ['RTSP://camera/live', true],
    ['custom+media://source', true],
    ['-', true],
    ['/tmp/local.mp4', false],
  ])('detects remote input %s', (value, expected) => {
    expect(isRemoteInput(value)).toBe(expected);
  });

  it.each([
    [192, '192k'],
    ['192', '192k'],
    ['2.5', '2.5k'],
    ['4M', '4M'],
  ])('normalizes bitrate %s', (value, expected) => {
    expect(asBitrate(value)).toBe(expected);
  });
});
