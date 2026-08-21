import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ffmpeg, { FfmpegError } from '../src/index.js';
import { runProcess } from '../src/process.js';

const integration = process.env.FFMPEG_INTEGRATION === '1' ? describe : describe.skip;

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit code ${code}`))));
  });
}

integration('real FFmpeg integration', () => {
  it('probes, remuxes, reports progress, and extracts a frame', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-integration-'));
    const input = join(directory, 'input with spaces.mkv');
    const output = join(directory, 'output with spaces.mkv');
    const framesDirectory = join(directory, 'frames');
    const watermark = join(directory, 'watermark.bmp');
    const watermarked = join(directory, 'watermarked.mkv');
    await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x240:r=25',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1000:sample_rate=44100',
      '-t',
      '1',
      '-c:v',
      'mpeg4',
      '-c:a',
      'pcm_s16le',
      input,
    ]);

    const video = await ffmpeg(input, { overwrite: true, timeout: 30_000 });
    expect(video.metadata.video.resolution).toEqual({ w: 320, h: 240 });
    expect(video.metadata.duration.seconds).toBeGreaterThanOrEqual(1);
    const progress = new Promise<void>((resolveProgress) =>
      video.once('progress', () => resolveProgress()),
    );
    await video.setVideoCodec('copy').setAudioCodec('copy').save(output);
    await progress;
    const frames = await (
      await ffmpeg(output, { overwrite: true })
    ).fnExtractFrameToJPG(framesDirectory, { number: 1, size: '160x?' });
    expect(frames).toHaveLength(1);

    await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=32x32',
      '-frames:v',
      '1',
      '-update',
      '1',
      watermark,
    ]);
    const watermarkVideo = await ffmpeg(input, { overwrite: true, timeout: 30_000 });
    await watermarkVideo
      .addInput(input)
      .setWatermark(watermark, { position: 'NE', margin_east: 4, margin_nord: 4 })
      .setVideoCodec('mpeg4')
      .setAudioCodec('copy')
      .save(watermarked);
    expect(existsSync(watermarked)).toBe(true);
  }, 60_000);

  it('times out and terminates a real unbounded FFmpeg process', async () => {
    const error = await runProcess(
      'ffmpeg',
      ['-hide_banner', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=25', '-f', 'null', '-'],
      {
        encoding: 'utf8',
        timeout: 500,
        maxBuffer: 1024 * 1024,
        overwrite: false,
        ffmpegPath: 'ffmpeg',
        ffprobePath: 'ffprobe',
      },
    ).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 116 });
    expect((error as FfmpegError).stderr).toContain('testsrc');
  }, 10_000);
});
