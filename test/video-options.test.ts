import { describe, expect, it } from 'vitest';
import { createVideo, input, metadata, watermark } from './helpers.js';

function argsOf(configure: (video: ReturnType<typeof createVideo>) => void): string[] {
  const video = createVideo();
  configure(video);
  return video.getCommand('/tmp/output.mp4').args;
}

describe('video options', () => {
  it('builds format, codec, bitrate, rate, quality and timing flags', () => {
    const args = argsOf((video) =>
      video
        .setVideoFormat('mp4')
        .setVideoCodec('libx264')
        .setVideoBitRate('2.5')
        .setVideoFrameRate(60)
        .setVideoStartTime('00:00:01.50')
        .setVideoDuration(3)
        .setVideoQuality(18),
    );
    expect(args).toEqual(
      expect.arrayContaining([
        '-f',
        'mp4',
        '-c:v',
        'libx264',
        '-b:v',
        '2.5k',
        '-r',
        '60',
        '-ss',
        '1.5',
        '-t',
        '3',
        '-q:v',
        '18',
      ]),
    );
  });

  it('supports stream copy and disabling video', () => {
    expect(argsOf((video) => video.setVideoCodec('copy'))).toContain('copy');
    expect(argsOf((video) => video.setDisableVideo())).toContain('-vn');
  });

  it.each([
    ['format', () => createVideo().setVideoFormat('unknown'), 104],
    ['codec', () => createVideo().setVideoCodec('unknown'), 113],
  ])('rejects unsupported video %s', (_name, operation, code) => {
    expect(operation).toThrow(expect.objectContaining({ code }));
  });

  it.each([
    ['16:9', '16:9'],
    [1.85, '1.85'],
    ['source', metadata.video.aspect.string],
  ])('sets aspect ratio %s', (value, expected) => {
    const args = argsOf((video) => video.setVideoAspectRatio(value));
    expect(args.slice(args.indexOf('-aspect'), args.indexOf('-aspect') + 2)).toEqual([
      '-aspect',
      expected,
    ]);
  });
});

describe('video sizing', () => {
  it.each([
    ['640x?', '640x360'],
    ['?x360', '640x360'],
    ['50%', '960x540'],
    ['641x359', '640x358'],
  ])('calculates %s as an even %s frame', (size, expected) => {
    const args = argsOf((video) => video.setVideoSize(size));
    expect(args.slice(args.indexOf('-s'), args.indexOf('-s') + 2)).toEqual(['-s', expected]);
  });

  it('uses square-pixel source dimensions when requested', () => {
    const video = createVideo();
    video.metadata.video.resolutionSquare = { w: 1440, h: 1080 };
    video.setVideoSize('50%', true);
    expect(video.getCommand('/tmp/out.mp4').args).toContain('720x540');
  });

  it('adds pad and aspect filters when preserving aspect', () => {
    const args = argsOf((video) => video.setVideoSize('640x480', false, true, '#112233'));
    expect(args).toContain('4:3');
    expect(args.join(' ')).toContain('pad=max');
    expect(args.join(' ')).toContain('#112233');
  });

  it('rejects unsupported sizes', () => {
    expect(() => createVideo().setVideoSize('HD').getCommand('/tmp/out.mp4')).toThrow(
      expect.objectContaining({ code: 110 }),
    );
  });

  it('rejects square-pixel sizing when no square resolution exists', () => {
    const video = createVideo();
    video.metadata.video.resolutionSquare = {};
    expect(() => video.setVideoSize('50%', true).getCommand('/tmp/out.mp4')).toThrow(
      expect.objectContaining({ code: 111 }),
    );
  });
});

describe('audio, metadata and custom options', () => {
  it('builds all audio controls and maps mp3 to libmp3lame', () => {
    const args = argsOf((video) =>
      video
        .setAudioCodec('mp3')
        .setAudioFrequency(44100)
        .setAudioChannels(1)
        .setAudioBitRate(192)
        .setAudioQuality('4'),
    );
    expect(args).toEqual(
      expect.arrayContaining([
        '-c:a',
        'libmp3lame',
        '-ar',
        '44100',
        '-ac',
        '1',
        '-b:a',
        '192k',
        '-q:a',
        '4',
      ]),
    );
  });

  it('supports audio stream copy and disabling audio', () => {
    expect(argsOf((video) => video.setAudioCodec('copy'))).toContain('copy');
    expect(argsOf((video) => video.setDisableAudio())).toContain('-an');
  });

  it.each([0, 3, -1])('rejects invalid channel count %s', (channels) => {
    expect(() => createVideo().setAudioChannels(channels)).toThrow(
      expect.objectContaining({ code: 105 }),
    );
  });

  it('rejects unsupported audio codecs', () => {
    expect(() => createVideo().setAudioCodec('vorbis')).toThrow(
      expect.objectContaining({ code: 113 }),
    );
  });

  it('supports both metadata overloads', () => {
    const args = argsOf((video) =>
      video.setMetadata('title', 'One').setMetadata({ artist: 'Two', track: 3 }),
    );
    expect(args.filter((argument) => argument === '-metadata')).toHaveLength(3);
    expect(args).toEqual(expect.arrayContaining(['title=One', 'artist=Two', 'track=3']));
  });

  it('normalizes thread counts', () => {
    expect(argsOf((video) => video.setThreads(3.9))).toEqual(
      expect.arrayContaining(['-threads', '3']),
    );
    expect(argsOf((video) => video.setThreads(-4))).toEqual(
      expect.arrayContaining(['-threads', '0']),
    );
  });

  it('preserves duplicate custom options, additional inputs and filter order', () => {
    const args = argsOf((video) =>
      video
        .addInput('second input.mp4')
        .addOutputOption('-map', '0:v')
        .addCommand('-map', '1:a')
        .addFilterComplex('[0:v]negate[out]')
        .addFilterComplex('[out]hflip[final]'),
    );
    expect(args.filter((argument) => argument === '-i')).toHaveLength(2);
    expect(args.filter((argument) => argument === '-map')).toHaveLength(2);
    expect(args).toContain('[0:v]negate[out],[out]hflip[final]');
  });

  it('uses no-overwrite by default and overwrite when enabled', () => {
    expect(createVideo().getCommand('/tmp/a.mp4').args[0]).toBe('-n');
    expect(createVideo({ overwrite: true }).getCommand('/tmp/a.mp4').args[0]).toBe('-y');
  });

  it('quotes paths only in the display string', () => {
    const command = createVideo().getCommand('/tmp/output file.mp4');
    expect(command.args).toContain('/tmp/output file.mp4');
    expect(command.display).toContain('"/tmp/output file.mp4"');
    expect(command.command).toBe(command.display.split(' ')[0]);
  });
});

describe('watermark placement', () => {
  it.each([
    ['NW', 'overlay=4:1'],
    ['NC', 'overlay=(main_w-overlay_w)/2:1'],
    ['NE', 'overlay=main_w-overlay_w-3:1'],
    ['CW', 'overlay=4:(main_h-overlay_h)/2'],
    ['C', 'overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2'],
    ['CE', 'overlay=main_w-overlay_w-3:(main_h-overlay_h)/2'],
    ['SW', 'overlay=4:main_h-overlay_h-2'],
    ['SC', 'overlay=(main_w-overlay_w)/2:main_h-overlay_h-2'],
    ['SE', 'overlay=main_w-overlay_w-3:main_h-overlay_h-2'],
  ] as const)('uses conventional coordinates for %s', (position, expected) => {
    const args = argsOf((video) =>
      video.setWatermark(watermark, {
        position,
        margin_nord: 1,
        margin_sud: 2,
        margin_east: 3,
        margin_west: 4,
      }),
    );
    expect(args).toContain(expected);
  });

  it('defaults to south-west', () => {
    expect(argsOf((video) => video.setWatermark(watermark))).toContain(
      'overlay=0:main_h-overlay_h-0',
    );
  });

  it('rejects missing watermarks and invalid positions', () => {
    expect(() => createVideo().setWatermark('/missing/logo.png')).toThrow(
      expect.objectContaining({ code: 108 }),
    );
    expect(() => createVideo().setWatermark(watermark, { position: 'BAD' as never })).toThrow(
      expect.objectContaining({ code: 109 }),
    );
  });

  it('keeps the original input before the watermark input', () => {
    const args = argsOf((video) => video.setWatermark(watermark));
    expect(args.slice(2, 6)).toEqual(['-i', input, '-i', watermark]);
  });
});
