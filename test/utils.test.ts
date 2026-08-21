import { describe, expect, it } from 'vitest';
import {
  asBitrate,
  assertSafeOutput,
  durationToSeconds,
  ffmpegColor,
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

  it.each([
    { encoding: 'not-an-encoding' },
    { timeout: -1 },
    { timeout: Number.NaN },
    { maxBuffer: 0 },
    { maxBuffer: 1.5 },
    { ffmpegPath: '' },
    { ffprobePath: '   ' },
    { overwrite: 'yes' },
    { cwd: '' },
    { env: [] },
    { signal: {} },
    {
      signal: {
        aborted: false,
        addEventListener() {
          // Deliberately incomplete: removeEventListener is missing.
        },
      },
    },
  ])('rejects invalid setting values %o', (invalid) => {
    expect(() => resolveSettings(invalid as never, defaults)).toThrow();
  });

  it('rejects a non-object settings container', () => {
    expect(() => resolveSettings(null as never, defaults)).toThrow(
      expect.objectContaining({ code: 123 }),
    );
  });

  it('rejects an AbortSignal-shaped object without a complete event interface', () => {
    expect(() =>
      resolveSettings(
        {
          signal: {
            aborted: false,
            addEventListener() {
              // Deliberately incomplete: removeEventListener is missing.
            },
          } as never,
        },
        defaults,
      ),
    ).toThrow(expect.objectContaining({ code: 123 }));
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
    ['-', false],
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

  it.each([0, -1, Number.NaN, '', 'fast', '-2M'])('rejects invalid bitrate %s', (value) => {
    expect(() => asBitrate(value)).toThrow(expect.objectContaining({ code: 120 }));
  });

  it.each(['output.mp4', './-report', '/tmp/-report', 'video with spaces.mp4'])(
    'accepts safe output argument %s',
    (value) => expect(() => assertSafeOutput(value)).not.toThrow(),
  );

  it.each(['-report', '-', '', null])('rejects unsafe output argument %s', (value) => {
    expect(() => assertSafeOutput(value)).toThrow(
      expect.objectContaining({ code: value === '' || value === null ? 123 : 124 }),
    );
  });

  it.each(['black', 'AliceBlue', '#112233', '0x11223344', '112233', 'red@0.5', '#112233@0x80'])(
    'accepts filter-safe FFmpeg color %s',
    (value) => {
      expect(ffmpegColor(value)).toBe(value);
    },
  );

  it.each(['red,negate', 'red;null', 'red:blue', 'red\\,negate', 'red@2', ''])(
    'rejects unsafe FFmpeg color %s',
    (value) => expect(() => ffmpegColor(value)).toThrow(expect.objectContaining({ code: 125 })),
  );
});
