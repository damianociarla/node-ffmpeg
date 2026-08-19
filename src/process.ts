import { spawn } from 'node:child_process';
import { FfmpegError, renderError } from './errors.js';
import type { ProcessResult, ResolvedSettings } from './types.js';
import { quoteForDisplay } from './utils.js';

interface RunOptions {
  acceptExitCodes?: number[];
  onStderr?: (chunk: string) => void;
}

function appendTail(current: string, chunk: string, maxBytes: number): string {
  const combined = current + chunk;
  if (Buffer.byteLength(combined) <= maxBytes) return combined;
  const buffer = Buffer.from(combined);
  return buffer.subarray(Math.max(0, buffer.length - maxBytes)).toString();
}

export function runProcess(
  command: string,
  args: string[],
  settings: ResolvedSettings,
  options: RunOptions = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const child = spawn(command, args, {
      cwd: settings.cwd,
      env: settings.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stop = (): void => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
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
      stdout = appendTail(stdout, chunk, settings.maxBuffer);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = appendTail(stderr, chunk, settings.maxBuffer);
      options.onStderr?.(chunk);
    });

    child.on('error', (cause: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new FfmpegError(114, renderError('executable_not_found', command).message, {
          cause,
          stderr,
        }),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) {
        reject(renderError('process_timeout', settings.timeout));
        return;
      }
      if (aborted) {
        reject(renderError('process_aborted'));
        return;
      }
      const exitCode = code ?? -1;
      if (!(options.acceptExitCodes ?? [0]).includes(exitCode)) {
        const error = renderError('process_failed', exitCode);
        reject(new FfmpegError(error.code, error.message, { stderr }));
        return;
      }
      resolve({
        command,
        args,
        code: exitCode,
        stdout,
        stderr,
      });
    });

    function cleanup(): void {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      settings.signal?.removeEventListener('abort', onAbort);
    }
  });
}

export function displayCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteForDisplay).join(' ');
}
