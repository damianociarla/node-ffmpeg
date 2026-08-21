import { existsSync } from 'node:fs';
import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FfmpegError } from '../src/errors.js';
import { effectiveDuration, parseProgress, ProgressStreamParser } from '../src/video.js';
import { createVideo, watermark } from './helpers.js';

describe('conversion execution and lifecycle', () => {
  it('rejects option-like outputs asynchronously before spawning FFmpeg', async () => {
    const video = createVideo();
    const onStart = vi.fn();
    const onError = vi.fn();
    video.on('start', onStart);
    video.on('error', onError);
    let save: Promise<string> | undefined;
    let audio: Promise<string> | undefined;
    expect(() => {
      save = video.save('-report');
      audio = video.fnExtractSoundToMP3('-report');
    }).not.toThrow();
    await expect(save).rejects.toMatchObject({ code: 124 });
    await expect(audio).rejects.toMatchObject({ code: 124 });
    expect(onStart).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('delivers validation failures to callbacks exactly once and asynchronously', async () => {
    const video = createVideo();
    const callback = vi.fn();
    let synchronous = true;
    await new Promise<void>((resolve) => {
      expect(() =>
        video.save('-report', (error, result) => {
          callback(error, result);
          expect(synchronous).toBe(false);
          expect(error).toMatchObject({ code: 124 });
          expect(result).toBeNull();
          resolve();
        }),
      ).not.toThrow();
      synchronous = false;
    });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('consumes fluent options even when planning fails', async () => {
    const video = createVideo().setDisableAudio().addCommand('-movflags', 'faststart');
    await expect(video.save('-report')).rejects.toMatchObject({ code: 124 });
    const next = video.getCommand('/tmp/next-after-planning-error.mp4').args;
    expect(next).not.toContain('-an');
    expect(next).not.toContain('-movflags');
  });

  it('emits start, stderr, progress and end in order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-events-'));
    const video = createVideo({ overwrite: true });
    const events: string[] = [];
    video.on('start', (command) => {
      events.push('start');
      expect(command).toContain('-y');
    });
    video.on('stderr', () => events.push('stderr'));
    video.on('progress', (progress) => {
      events.push('progress');
      expect(progress.percent).toBeCloseTo(47.62, 1);
    });
    video.on('end', (result) => {
      events.push('end');
      expect(result.code).toBe(0);
    });
    await video.save(join(directory, 'out.mp4'));
    expect(events[0]).toBe('start');
    expect(events.at(-1)).toBe('end');
    expect(events).toEqual(expect.arrayContaining(['stderr', 'progress']));
  });

  it('supports the legacy success callback', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-callback-'));
    const destination = join(directory, 'callback.mp4');
    const video = createVideo();
    await new Promise<void>((resolve, reject) => {
      video.save(destination, (error, result) => {
        if (error) reject(error);
        else {
          expect(result).toBe(destination);
          resolve();
        }
      });
    });
  });

  it('supports the legacy error callback and error event', async () => {
    const video = createVideo();
    const onError = vi.fn();
    video.on('error', onError);
    await new Promise<void>((resolve) => {
      video.save('/tmp/forced-failure-callback.mp4', (error, result) => {
        expect(error).toMatchObject({ code: 115 });
        expect(result).toBeNull();
        resolve();
      });
    });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('resets fluent options after success', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-reset-success-'));
    const video = createVideo().setDisableAudio().addCommand('-movflags', 'faststart');
    await video.save(join(directory, 'first.mp4'));
    const next = video.getCommand(join(directory, 'second.mp4')).args;
    expect(next).not.toContain('-an');
    expect(next).not.toContain('-movflags');
  });

  it('resets fluent options after failure', async () => {
    const video = createVideo().setDisableAudio();
    await expect(video.save('/tmp/forced-failure-reset.mp4')).rejects.toMatchObject({ code: 115 });
    expect(video.getCommand('/tmp/next.mp4').args).not.toContain('-an');
  });

  it('isolates concurrent operations on the same Video', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-concurrent-video-'));
    const slowDestination = join(directory, 'forced-slow-first.mp4');
    const fastDestination = join(directory, 'second.mp4');
    const video = createVideo().setDisableAudio();
    const slow = video.save(slowDestination);
    video.setVideoCodec('libx264');
    const fast = video.save(fastDestination);

    await Promise.all([slow, fast]);
    const slowArgs = JSON.parse(await readFile(slowDestination, 'utf8')) as string[];
    const fastArgs = JSON.parse(await readFile(fastDestination, 'utf8')) as string[];
    expect(slowArgs).toContain('-an');
    expect(slowArgs).not.toContain('libx264');
    expect(fastArgs).toContain('libx264');
    expect(fastArgs).not.toContain('-an');
  });

  it('does not erase builder changes made while an operation is active', async () => {
    const video = createVideo().setDisableAudio();
    const slow = video.save('/tmp/forced-slow-pending-builder.mp4');
    video.setVideoCodec('libx264');
    await slow;
    expect(video.getCommand('/tmp/after-slow.mp4').args).toContain('libx264');
  });

  it('supports conversion abort signals', async () => {
    const controller = new AbortController();
    const video = createVideo({ signal: controller.signal });
    const promise = video.save('/tmp/forced-slow-abort.mp4');
    setTimeout(() => controller.abort(), 25);
    await expect(promise).rejects.toMatchObject({ code: 117 });
  });

  it('reports progress against the configured output duration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-trim-progress-'));
    const video = createVideo().setVideoDuration(5);
    const progress = new Promise<number | undefined>((resolve) => {
      video.once('progress', (event) => resolve(event.percent));
    });
    await video.save(join(directory, 'trimmed.mp4'));
    await expect(progress).resolves.toBe(100);
  });
});

describe('MP3 extraction', () => {
  it.each([
    ['audio.mp3', 'audio.mp3'],
    ['audio.wav', 'audio.mp3'],
    ['audio', 'audio.mp3'],
  ])('normalizes %s to %s', async (requested, expectedName) => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-audio-'));
    const video = createVideo();
    const result = await video.fnExtractSoundToMP3(join(directory, requested));
    expect(basename(result)).toBe(expectedName);
    expect(existsSync(result)).toBe(true);
    expect(JSON.parse(await readFile(result, 'utf8'))).toEqual(
      expect.arrayContaining(['-vn', '-ar', '44100', '-ac', '2', '-b:a', '192k', 'libmp3lame']),
    );
  });

  it('supports the legacy callback', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-audio-callback-'));
    await new Promise<void>((resolve, reject) => {
      createVideo().fnExtractSoundToMP3(join(directory, 'sound'), (error, result) => {
        if (error) reject(error);
        else {
          expect(result).toMatch(/sound\.mp3$/);
          resolve();
        }
      });
    });
  });

  it('delivers validation errors through the legacy callback', async () => {
    let synchronous = true;
    await new Promise<void>((resolve) => {
      expect(() =>
        createVideo().fnExtractSoundToMP3('-report', (error, result) => {
          expect(synchronous).toBe(false);
          expect(error).toMatchObject({ code: 124 });
          expect(result).toBeNull();
          resolve();
        }),
      ).not.toThrow();
      synchronous = false;
    });
  });
});

describe('frame extraction', () => {
  it('rejects option-like frame patterns and unsafe padding colors before execution', async () => {
    const onStart = vi.fn();
    const video = createVideo();
    video.on('start', onStart);
    await expect(video.fnExtractFrameToJPG('.', { file_name: '-report' })).rejects.toMatchObject({
      code: 124,
    });
    await expect(
      video.fnExtractFrameToJPG('.', { padding_color: 'red,negate' }),
    ).rejects.toMatchObject({ code: 125 });
    expect(onStart).not.toHaveBeenCalled();
  });

  it('maps destination directory failures to stable error 106', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-frame-mkdir-'));
    const file = join(directory, 'not-a-directory');
    await writeFile(file, 'fixture');
    const error = await createVideo()
      .fnExtractFrameToJPG(file)
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 106 });
    expect((error as FfmpegError).cause).toBeInstanceOf(Error);
  });

  it.each([
    [{ every_n_frames: 5 }, 'select=not(mod(n\\,5))'],
    [{ every_n_seconds: 2 }, 'select=not(mod(t\\,2))'],
    [{ every_n_percentage: 20 }, 'select=not(mod(t\\,2.1))'],
  ])('builds selector %s', async (settings, expectedFilter) => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-selector-'));
    const frames = await createVideo().fnExtractFrameToJPG(directory, {
      ...settings,
      file_name: 'selector',
    });
    const command = JSON.parse(await readFile(frames[0] ?? '', 'utf8')) as string;
    expect(command).toContain(expectedFilter);
    expect(command).toContain('-fps_mode');
  });

  it('builds timing, size, count, quality and name placeholders', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-frame-options-'));
    const frames = await createVideo().fnExtractFrameToJPG(directory, {
      start_time: '00:00:01.25',
      duration_time: 3,
      frame_rate: 12,
      size: '320x180',
      number: 2,
      quality: 5,
      file_name: 'thumb_%s_%x_%y_%z',
    });
    expect(frames.map((frame) => basename(frame))).toEqual([
      'thumb_320x180_320_180__1.jpg',
      'thumb_320x180_320_180__2.jpg',
    ]);
    const command = JSON.parse(await readFile(frames[0] ?? '', 'utf8')) as string[];
    expect(command).toEqual(
      expect.arrayContaining([
        '-ss',
        '1.25',
        '-t',
        '3',
        '-r',
        '12',
        '-s',
        '320x180',
        '-frames:v',
        '2',
        '-q:v',
        '5',
      ]),
    );
  });

  it('does not return unrelated files and sorts generated frames numerically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-frame-sort-'));
    await writeFile(join(directory, 'unrelated.jpg'), 'no');
    const frames = await createVideo().fnExtractFrameToJPG(directory, { file_name: 'frame' });
    expect(frames.map((frame) => basename(frame))).toEqual(['frame_1.jpg', 'frame_2.jpg']);
  });

  it('does not return matching frames left behind by an earlier run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-stale-frames-'));
    await writeFile(join(directory, 'frame_3.jpg'), 'stale');
    const frames = await createVideo({ overwrite: true }).fnExtractFrameToJPG(directory, {
      file_name: 'frame',
    });
    expect(frames.map((frame) => basename(frame))).toEqual(['frame_1.jpg', 'frame_2.jpg']);
  });

  it.each([0, -1, 101])('rejects invalid percentage %s', async (percentage) => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-percentage-'));
    await expect(
      createVideo().fnExtractFrameToJPG(directory, { every_n_percentage: percentage }),
    ).rejects.toMatchObject({ code: 107 });
  });

  it.each([
    [{ every_n_frames: 0 }, 120],
    [{ every_n_frames: 1.5 }, 120],
    [{ every_n_seconds: Number.NaN }, 120],
    [{ frame_rate: -1 }, 120],
    [{ number: 0 }, 120],
    [{ number: 1.5 }, 120],
    [{ quality: Number.NaN }, 120],
    [{ start_time: 'tomorrow' }, 121],
    [{ start_time: '00:99:00' }, 121],
    [{ duration_time: 0 }, 121],
  ] as const)('rejects invalid frame setting %o', async (invalidSettings, code) => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-invalid-frame-setting-'));
    await expect(
      createVideo().fnExtractFrameToJPG(directory, invalidSettings),
    ).rejects.toMatchObject({ code });
  });

  it('does not poison the Video Builder after invalid dimensions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-frame-reuse-'));
    const video = createVideo().setDisableAudio();
    await expect(video.fnExtractFrameToJPG(directory, { size: 'INVALID' })).rejects.toMatchObject({
      code: 110,
    });
    const next = video.getCommand(join(directory, 'valid.mp4')).args;
    expect(next).not.toContain('-an');
    expect(next.at(-1)).toBe(join(directory, 'valid.mp4'));
  });

  it('supports both frame callback overloads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-frame-callback-'));
    await new Promise<void>((resolve, reject) => {
      createVideo().fnExtractFrameToJPG(directory, { number: 1 }, (error, result) => {
        if (error) reject(error);
        else {
          expect(result).toHaveLength(2);
          resolve();
        }
      });
    });
  });
});

describe('watermark preset', () => {
  it('rejects an option-like explicit watermark destination asynchronously', async () => {
    let promise: Promise<string> | undefined;
    expect(() => {
      promise = createVideo().fnAddWatermark(watermark, '-report');
    }).not.toThrow();
    await expect(promise).rejects.toMatchObject({ code: 124 });
  });

  it('derives a destination name and writes the result', async () => {
    const result = await createVideo().fnAddWatermark(watermark, { position: 'C' });
    expect(result).toBe(
      join(import.meta.dirname, 'fixtures', 'input video_watermark_watermark.mp4'),
    );
    expect(existsSync(result)).toBe(true);
    await unlink(result);
  });

  it('supports explicit destination, settings and callback', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-watermark-callback-'));
    const destination = join(directory, 'marked.mp4');
    await new Promise<void>((resolve, reject) => {
      createVideo().fnAddWatermark(watermark, destination, { position: 'SE' }, (error, result) => {
        if (error) reject(error);
        else {
          expect(result).toBe(destination);
          resolve();
        }
      });
    });
  });

  it('delivers watermark validation errors through the callback', async () => {
    let synchronous = true;
    await new Promise<void>((resolve) => {
      expect(() =>
        createVideo().fnAddWatermark(watermark, '-report', {}, (error, result) => {
          expect(synchronous).toBe(false);
          expect(error).toMatchObject({ code: 124 });
          expect(result).toBeNull();
          resolve();
        }),
      ).not.toThrow();
      synchronous = false;
    });
  });
});

describe('progress parsing edge cases', () => {
  it.each([
    [10.5, {}, 10.5],
    [10.5, { startTime: 2 }, 8.5],
    [10.5, { duration: 3 }, 3],
    [10.5, { startTime: 9, duration: 3 }, 1.5],
    [0, { duration: 5 }, 5],
    [0, {}, 0],
  ] as const)('calculates effective duration for %s and %o', (source, window, expected) => {
    expect(effectiveDuration(source, window)).toBe(expected);
  });

  it('returns undefined without a timestamp', () => {
    expect(parseProgress('frame=1 fps=25', 10)).toBeUndefined();
  });

  it('parses time without optional metrics', () => {
    expect(parseProgress('time=01:02:03.50', 0)).toEqual({ time: 3723.5 });
  });

  it('caps percentage at one hundred', () => {
    expect(parseProgress('time=00:00:20.00', 10)?.percent).toBe(100);
  });

  it('reassembles split lines and emits every update received in one chunk', () => {
    const parser = new ProgressStreamParser(10);
    expect(parser.write('frame=1 fps=2 time=00:00:')).toEqual([]);
    expect(parser.write('01.00 speed=1x\rframe=2 fps=3 time=00:00:02.00 speed=1.5x\r')).toEqual([
      { frames: 1, fps: 2, time: 1, speed: 1, percent: 10 },
      { frames: 2, fps: 3, time: 2, speed: 1.5, percent: 20 },
    ]);
  });
});
