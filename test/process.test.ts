/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any. */
import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ByteCollector, displayCommand, runProcess, terminateProcessTree } from '../src/process.js';
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
      runProcess(fakeFfmpeg, ['/tmp/forced-slow.mp4'], { ...settings, timeout: 200 }),
    ).rejects.toMatchObject({
      code: 116,
      stderr: expect.stringContaining('diagnostic before slow process'),
    });
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
    setTimeout(() => controller.abort(), 100);
    await expect(promise).rejects.toMatchObject({
      code: 117,
      stderr: expect.stringContaining('diagnostic before slow process'),
    });
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

  it('fails instead of returning truncated stdout when complete output is required', async () => {
    await expect(
      runProcess(
        fakeFfmpeg,
        ['--large-output', '/tmp/large-complete-output.mp4'],
        { ...settings, maxBuffer: 96 },
        { stdout: 'full' },
      ),
    ).rejects.toMatchObject({ code: 119 });
  });

  it.skipIf(process.platform === 'win32')(
    'terminates descendants in the child process group',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'node-ffmpeg-process-tree-'));
      const destination = join(directory, 'process-tree.mp4');
      await expect(
        runProcess(fakeFfmpeg, [destination], { ...settings, timeout: 150 }),
      ).rejects.toMatchObject({ code: 116 });
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(existsSync(`${destination}.child`)).toBe(false);
    },
  );
});

describe('bounded byte collection', () => {
  it('drops complete old chunks without repeatedly copying the retained tail', () => {
    const collector = new ByteCollector(5, 'tail');
    expect(collector.add('ab', 'utf8')).toBe(true);
    expect(collector.add('cde', 'utf8')).toBe(true);
    expect(collector.add('fg', 'utf8')).toBe(true);
    expect(collector.toString('utf8')).toBe('cdefg');
  });

  it('slices only the oldest partial chunk and handles a single oversized chunk', () => {
    const collector = new ByteCollector(5, 'tail');
    collector.add('abcd', 'utf8');
    collector.add('ef', 'utf8');
    expect(collector.toString('utf8')).toBe('bcdef');
    collector.add('0123456789', 'utf8');
    expect(collector.toString('utf8')).toBe('56789');
  });

  it('accepts complete output up to the limit', () => {
    const collector = new ByteCollector(5, 'full');
    expect(collector.add('12345', 'utf8')).toBe(true);
    expect(collector.toString('utf8')).toBe('12345');
  });
});

describe('process tree termination', () => {
  it.each([
    ['SIGTERM', ['/pid', '42', '/t']],
    ['SIGKILL', ['/pid', '42', '/t', '/f']],
  ] as const)('uses taskkill for Windows %s and falls back after spawn errors', (signal, args) => {
    const taskkill = new EventEmitter();
    const spawnProcess = vi.fn(
      () => taskkill,
    ) as unknown as typeof import('node:child_process').spawn;
    const child = { pid: 42, kill: vi.fn(() => true) };
    terminateProcessTree(child, signal, 'win32', spawnProcess);
    expect(spawnProcess).toHaveBeenCalledWith(
      'taskkill.exe',
      args,
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
    taskkill.emit('error', new Error('missing taskkill'));
    expect(child.kill).toHaveBeenCalledWith(signal);
  });

  it('signals a POSIX process group', () => {
    const child = { pid: 42, kill: vi.fn(() => true) };
    const killGroup = vi.fn(() => true);
    terminateProcessTree(child, 'SIGTERM', 'darwin', undefined, killGroup);
    expect(killGroup).toHaveBeenCalledWith(-42, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('falls back to the direct child when group signaling fails or no pid exists', () => {
    const child = { pid: 42, kill: vi.fn(() => true) };
    const killGroup = vi.fn(() => {
      throw new Error('already exited');
    });
    terminateProcessTree(child, 'SIGTERM', 'linux', undefined, killGroup);
    terminateProcessTree({ pid: undefined, kill: child.kill }, 'SIGKILL', 'win32');
    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });
});

describe('display command', () => {
  it('renders an informative shell-like display without executing a shell', () => {
    expect(
      displayCommand('/bin/ffmpeg', ['-i', 'input video.mp4', '-metadata', 'title=Hello']),
    ).toBe('/bin/ffmpeg -i "input video.mp4" -metadata title=Hello');
  });
});
