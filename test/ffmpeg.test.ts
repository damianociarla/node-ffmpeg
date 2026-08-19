import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import ffmpeg, { create, FfmpegError, parseProgress } from '../src/index.js';

const fixtures = resolve(import.meta.dirname, 'fixtures');
const input = join(fixtures, 'input video.mp4');
const watermark = join(fixtures, 'watermark.png');
const fakeFfmpeg = join(fixtures, 'fake-ffmpeg.mjs');
const fakeFfprobe = join(fixtures, 'fake-ffprobe.mjs');

beforeEach(() => {
  ffmpeg.bin = fakeFfmpeg;
  ffmpeg.ffprobeBin = fakeFfprobe;
});

describe('factory and probe', () => {
  it('preserves the historical promise constructor and returns typed metadata', async () => {
    const video = await new ffmpeg(input);
    expect(video.metadata.title).toBe('Fixture');
    expect(video.metadata.duration.seconds).toBe(10.5);
    expect(video.metadata.video).toMatchObject({ codec: 'h264', fps: 25, rotate: 90 });
    expect(video.metadata.audio.channels).toEqual({ raw: 'stereo', value: 2 });
    expect(video.info_configuration.codecs.encode).toContain('libx264');
  });

  it('supports the modern create API and legacy callback API', async () => {
    await expect(create(input)).resolves.toHaveProperty('file_path', input);
    await new Promise<void>((resolveCallback, reject) => {
      ffmpeg(input, (error, video) => {
        if (error) reject(error);
        else {
          expect(video?.metadata.video.resolution).toEqual({ w: 1920, h: 1080 });
          resolveCallback();
        }
      });
    });
  });

  it('keeps stable numeric legacy errors while using real Error instances', () => {
    expect(() => ffmpeg('')).toThrow(FfmpegError);
    try {
      void ffmpeg('/definitely/missing/file.mp4');
    } catch (error) {
      expect(error).toMatchObject({ code: 103, name: 'FfmpegError' });
    }
  });
});

describe('safe command building and conversion', () => {
  it('passes paths as process arguments and does not invoke a shell', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-safe-'));
    const destination = join(directory, 'output; touch SHELL_INJECTION.mp4');
    const video = await ffmpeg(input);
    video
      .setVideoCodec('libx264')
      .setVideoBitRate(2_000)
      .setAudioCodec('aac')
      .setAudioBitRate(192)
      .setMetadata({ title: 'A title', artist: 'An artist' });
    const command = video.getCommand(destination);
    expect(command.args).toContain('-b:v');
    expect(command.args).toContain('2000k');
    expect(command.args.filter((argument) => argument === '-metadata')).toHaveLength(2);

    await video.save(destination);
    expect(existsSync(destination)).toBe(true);
    expect(existsSync(join(directory, 'SHELL_INJECTION.mp4'))).toBe(false);
    expect(JSON.parse(await readFile(destination, 'utf8'))).toContain(destination);
  });

  it('accepts codec copy, duplicate custom flags, and reports progress', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-progress-'));
    const video = await ffmpeg(input);
    const progress = new Promise<number>((resolveProgress) => {
      video.once('progress', (event) => resolveProgress(event.percent ?? 0));
    });
    video.setVideoCodec('copy').addCommand('-map', '0:v').addCommand('-map', '0:a');
    await video.save(join(directory, 'copy.mp4'));
    await expect(progress).resolves.toBeCloseTo(47.62, 1);
  });

  it('propagates process failures without requiring an error event listener', async () => {
    const video = await ffmpeg(input);
    try {
      await video.save('/tmp/forced-failure.mp4');
      expect.fail('Expected conversion to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(FfmpegError);
      expect(error).toMatchObject({ code: 115 });
      expect((error as FfmpegError).stderr).toContain('forced failure');
    }
  });

  it('applies the configured timeout value and terminates the process', async () => {
    const video = await ffmpeg(input, { timeout: 300 });
    await expect(video.save('/tmp/forced-slow.mp4')).rejects.toMatchObject({ code: 116 });
  });
});

describe('presets', () => {
  it('extracts only matching generated frames from the destination directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-frames-'));
    await writeFile(join(directory, 'unrelated.jpg'), 'unrelated');
    const video = await ffmpeg(input, { overwrite: true });
    const frames = await video.fnExtractFrameToJPG(directory, {
      size: '50%',
      every_n_seconds: 2,
      file_name: 'thumb_%s',
    });
    expect(frames.map((file) => file.split('/').at(-1))).toEqual([
      'thumb_50%_1.jpg',
      'thumb_50%_2.jpg',
    ]);
  });

  it('uses conventional compass positions for watermarks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-watermark-'));
    const video = await ffmpeg(input);
    video.setWatermark(watermark, { position: 'NE', margin_east: 12, margin_nord: 8 });
    const command = video.getCommand(join(directory, 'watermarked.mp4'));
    expect(command.args).toContain('overlay=main_w-overlay_w-12:8');
    expect(command.args.slice(0, 6)).toEqual(['-n', '-hide_banner', '-i', input, '-i', watermark]);
  });

  it('rejects conflicting frame interval options', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-invalid-'));
    const video = await ffmpeg(input);
    await expect(
      video.fnExtractFrameToJPG(directory, { every_n_frames: 2, every_n_seconds: 1 }),
    ).rejects.toMatchObject({ code: 107 });
  });
});

it('parses progress independently', () => {
  expect(parseProgress('frame=3 fps=2 time=00:00:01.50 speed=1.2x', 3)).toEqual({
    frames: 3,
    fps: 2,
    time: 1.5,
    speed: 1.2,
    percent: 50,
  });
});
