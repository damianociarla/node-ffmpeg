/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { describe, expect, it, vi } from 'vitest';
import { displayCommand, runProcess } from '../src/process.js';
import { fakeFfmpeg, settings } from './helpers.js';

describe('process execution', () => {
  it('captures stdout, stderr, command, args and exit code', async () => {
    const onStderr = vi.fn();
    const result = await runProcess(
      fakeFfmpeg,
      ['--stdout', '/tmp/process-success.mp4'],
      settings,
      { onStderr },
    );
    expect(result).toMatchObject({
      command: fakeFfmpeg,
      args: ['--stdout', '/tmp/process-success.mp4'],
      code: 0,
    });
    expect(result.stdout).toContain('stdout fixture');
    expect(result.stderr).toContain('time=00:00:05.00');
    expect(onStderr).toHaveBeenCalled();
  });

  it('allows explicitly accepted non-zero exit codes', async () => {
    await expect(
      runProcess(fakeFfmpeg, ['--exit-seven'], settings, { acceptExitCodes: [0, 7] }),
    ).resolves.toMatchObject({ code: 7, stderr: expect.stringContaining('accepted exit fixture') });
  });

  it('rejects an unexpected exit and retains stderr', async () => {
    await expect(
      runProcess(fakeFfmpeg, ['/tmp/forced-failure.mp4'], settings),
    ).rejects.toMatchObject({ code: 115, stderr: expect.stringContaining('forced failure') });
  });

  it('maps missing executables to stable error 114 with a cause', async () => {
    const error = await runProcess('/definitely/missing/ffmpeg', [], settings).catch(
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({ code: 114, cause: expect.any(Error) });
  });

  it('terminates and maps timeouts to error 116', async () => {
    await expect(
      runProcess(fakeFfmpeg, ['/tmp/forced-slow.mp4'], { ...settings, timeout: 30 }),
    ).rejects.toMatchObject({ code: 116 });
  });

  it('supports signals that are already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runProcess(fakeFfmpeg, ['/tmp/forced-slow.mp4'], { ...settings, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 117 });
  });

  it('supports aborting an active process', async () => {
    const controller = new AbortController();
    const promise = runProcess(fakeFfmpeg, ['/tmp/forced-slow.mp4'], {
      ...settings,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 25);
    await expect(promise).rejects.toMatchObject({ code: 117 });
  });

  it('tails large stdout and stderr without killing the process', async () => {
    const result = await runProcess(fakeFfmpeg, ['--large-output', '/tmp/large-output.mp4'], {
      ...settings,
      maxBuffer: 96,
    });
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(96);
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(96);
    expect(result.stdout).toContain('STDOUT-END');
    expect(result.stderr).toContain('time=00:00:05.00');
  });
});

describe('display command', () => {
  it('renders an informative shell-like display without executing a shell', () => {
    expect(
      displayCommand('/bin/ffmpeg', ['-i', 'input video.mp4', '-metadata', 'title=Hello']),
    ).toBe('/bin/ffmpeg -i "input video.mp4" -metadata title=Hello');
  });
});
