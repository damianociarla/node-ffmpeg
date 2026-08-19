import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ffmpeg from '../src/index.js';

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
  }, 60_000);
});
