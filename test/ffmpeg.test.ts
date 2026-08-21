import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import ffmpeg, { create, createClient, FfmpegError, parseProgress } from '../src/index.js';

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

  it('applies the same local input validation to create and the callable factory', () => {
    expect(() => create('/definitely/missing/create-input.mp4')).toThrow(
      expect.objectContaining({ code: 103 }),
    );
    expect(() => ffmpeg('/definitely/missing/factory-input.mp4')).toThrow(
      expect.objectContaining({ code: 103 }),
    );
  });

  it('does not share configuration across different process environments', async () => {
    const first = await create(input, {
      env: { ...process.env, CONFIG_CODEC: 'tenant_one' },
    });
    const second = await create(input, {
      env: { ...process.env, CONFIG_CODEC: 'tenant_two' },
    });
    expect(first.info_configuration.codecs.encode).toContain('tenant_one');
    expect(second.info_configuration.codecs.encode).toContain('tenant_two');
    expect(second.info_configuration.codecs.encode).not.toContain('tenant_one');
  });

  it('cancels sibling initialization processes and preserves the root failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-owned-init-'));
    const failingInput = join(directory, 'probe-failure.mp4');
    const marker = join(directory, 'late-encoder-marker');
    await writeFile(failingInput, 'fixture');
    const started = performance.now();
    const error = await create(failingInput, {
      env: {
        ...process.env,
        CONFIG_DELAY: '3000',
        CONFIG_MARKER: marker,
      },
    }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 115 });
    expect((error as FfmpegError).stderr).toContain('probe failed');
    expect(performance.now() - started).toBeLessThan(1_500);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(existsSync(marker)).toBe(false);
  });

  it('inspects configuration once per client and probes once per opened media', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-client-count-'));
    const log = join(directory, 'invocations.ndjson');
    const client = await createClient({
      ffmpegPath: fakeFfmpeg,
      ffprobePath: fakeFfprobe,
      env: { ...process.env, INVOCATION_LOG: log },
    });
    const first = await client.open(input);
    const second = await client.open(input);
    const invocations = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { executable: string; args: string[] });
    expect(invocations.filter(({ args }) => args.includes('-formats'))).toHaveLength(1);
    expect(invocations.filter(({ args }) => args.includes('-encoders'))).toHaveLength(1);
    expect(invocations.filter(({ executable }) => executable === 'ffprobe')).toHaveLength(2);
    first.info_configuration.codecs.encode.push('consumer-mutation');
    expect(second.info_configuration.codecs.encode).not.toContain('consumer-mutation');
    expect(client.configuration.codecs.encode).not.toContain('consumer-mutation');
  });

  it('keeps client process context fixed while allowing per-open operation settings', async () => {
    const client = await createClient({ ffmpegPath: fakeFfmpeg, ffprobePath: fakeFfprobe });
    expect(() => client.open(input, { ffmpegPath: '/other/ffmpeg' } as never)).toThrow(
      expect.objectContaining({ code: 102 }),
    );
    await expect(client.open(input, { overwrite: true, timeout: 500 })).resolves.toHaveProperty(
      'file_path',
      input,
    );
  });

  it('isolates per-open abort signals and supports a client lifetime signal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-client-signals-'));
    const slowInput = join(directory, 'probe-slow.mp4');
    const normalInput = join(directory, 'normal.mp4');
    await Promise.all([writeFile(slowInput, 'fixture'), writeFile(normalInput, 'fixture')]);
    const lifetime = new AbortController();
    const client = await createClient({
      ffmpegPath: fakeFfmpeg,
      ffprobePath: fakeFfprobe,
      signal: lifetime.signal,
    });
    const operation = new AbortController();
    const slow = client.open(slowInput, { signal: operation.signal });
    const normal = client.open(normalInput);
    operation.abort();
    await expect(slow).rejects.toMatchObject({ code: 117 });
    await expect(normal).resolves.toHaveProperty('file_path', normalInput);
    lifetime.abort();
    await expect(client.open(normalInput)).rejects.toMatchObject({ code: 117 });
  });

  it('reports oversized ffprobe JSON without attempting to parse a truncated tail', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-probe-limit-'));
    const largeInput = join(directory, 'large-json.mp4');
    await writeFile(largeInput, 'fixture');
    await expect(create(largeInput, { maxBuffer: 512 })).rejects.toMatchObject({ code: 119 });
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
    expect(command.args).toContain('[0:v][1:v]overlay=main_w-overlay_w-12:8');
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
