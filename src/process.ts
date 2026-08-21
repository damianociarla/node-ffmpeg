import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { FfmpegError, renderError } from './errors.js';
import type { ProcessResult, ResolvedSettings } from './types.js';
import { quoteForDisplay } from './utils.js';

interface RunOptions {
  acceptExitCodes?: number[];
  onStderr?: (chunk: string) => void;
  /** Preserve complete stdout and fail when maxBuffer is exceeded. */
  stdout?: 'tail' | 'full';
}

export class ByteCollector {
  private chunks: Buffer[] = [];
  private bytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly mode: 'tail' | 'full',
  ) {}

  add(value: string, encoding: BufferEncoding): boolean {
    const chunk = Buffer.from(value, encoding);
    if (this.mode === 'full' && this.bytes + chunk.length > this.maxBytes) return false;
    if (this.mode === 'tail' && chunk.length >= this.maxBytes) {
      this.chunks = [chunk.subarray(chunk.length - this.maxBytes)];
      this.bytes = this.maxBytes;
      return true;
    }

    this.chunks.push(chunk);
    this.bytes += chunk.length;
    if (this.mode === 'tail') {
      while (this.bytes > this.maxBytes) {
        const first = this.chunks.at(0);
        if (!first) throw new Error('ByteCollector invariant violated');
        const excess = this.bytes - this.maxBytes;
        if (first.length <= excess) {
          this.chunks.shift();
          this.bytes -= first.length;
        } else {
          this.chunks[0] = first.subarray(excess);
          this.bytes -= excess;
        }
      }
    }
    return true;
  }

  toString(encoding: BufferEncoding): string {
    return Buffer.concat(this.chunks, this.bytes).toString(encoding);
  }
}

export function terminateProcessTree(
  child: Pick<ChildProcess, 'pid' | 'kill'>,
  signal: NodeJS.Signals,
  platform: NodeJS.Platform = process.platform,
  spawnProcess: typeof spawn = spawn,
  killGroup: (pid: number, signal: NodeJS.Signals) => boolean = (pid, groupSignal) =>
    process.kill(pid, groupSignal),
): void {
  if (platform === 'win32' && child.pid) {
    const args = ['/pid', String(child.pid), '/t'];
    if (signal === 'SIGKILL') args.push('/f');
    const taskkill = spawnProcess('taskkill.exe', args, {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    });
    taskkill.once('error', () => child.kill(signal));
    return;
  }
  if (platform !== 'win32' && child.pid) {
    try {
      killGroup(-child.pid, signal);
      return;
    } catch {
      // The child may have exited between the status check and the signal.
    }
  }
  child.kill(signal);
}

export function runProcess(
  command: string,
  args: string[],
  settings: ResolvedSettings,
  options: RunOptions = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const stdout = new ByteCollector(settings.maxBuffer, options.stdout ?? 'tail');
    const stderr = new ByteCollector(settings.maxBuffer, 'tail');
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let outputLimitExceeded = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const child = spawn(command, args, {
      cwd: settings.cwd,
      env: settings.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stop = (): void => {
      if (child.exitCode === null && child.signalCode === null) {
        terminateProcessTree(child, 'SIGTERM');
        forceKillTimer = setTimeout(() => terminateProcessTree(child, 'SIGKILL'), 2_000);
        forceKillTimer.unref();
      }
    };

    const timeout =
      settings.timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            stop();
          }, settings.timeout)
        : undefined;
    timeout?.unref();

    const onAbort = (): void => {
      aborted = true;
      stop();
    };
    if (settings.signal?.aborted) onAbort();
    else settings.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.setEncoding(settings.encoding);
    child.stderr.setEncoding(settings.encoding);
    child.stdout.on('data', (chunk: string) => {
      if (!outputLimitExceeded && !stdout.add(chunk, settings.encoding)) {
        outputLimitExceeded = true;
        stop();
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr.add(chunk, settings.encoding);
      options.onStderr?.(chunk);
    });

    child.on('error', (cause: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new FfmpegError(114, renderError('executable_not_found', command).message, {
          cause,
          stderr: stderr.toString(settings.encoding),
        }),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      const stderrText = stderr.toString(settings.encoding);
      if (outputLimitExceeded) {
        const error = renderError('process_output_limit', settings.maxBuffer);
        reject(new FfmpegError(error.code, error.message, { stderr: stderrText }));
        return;
      }
      if (timedOut) {
        const error = renderError('process_timeout', settings.timeout);
        reject(new FfmpegError(error.code, error.message, { stderr: stderrText }));
        return;
      }
      if (aborted) {
        const error = renderError('process_aborted');
        reject(new FfmpegError(error.code, error.message, { stderr: stderrText }));
        return;
      }
      const exitCode = code ?? -1;
      if (!(options.acceptExitCodes ?? [0]).includes(exitCode)) {
        const error = renderError('process_failed', exitCode);
        reject(new FfmpegError(error.code, error.message, { stderr: stderrText }));
        return;
      }
      resolve({
        command,
        args,
        code: exitCode,
        stdout: stdout.toString(settings.encoding),
        stderr: stderrText,
      });
    });

    function cleanup(): void {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      try {
        settings.signal?.removeEventListener('abort', onAbort);
      } catch {
        // Cleanup must never escape a child-process event handler.
      }
    }
  });
}

export function displayCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteForDisplay).join(' ');
}
