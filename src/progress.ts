import type { Progress } from './types.js';

export function effectiveDuration(
  sourceDuration: number,
  window: { startTime?: number | undefined; duration?: number | undefined } = {},
): number {
  const configured = window.duration;
  if (sourceDuration > 0) {
    const remaining = Math.max(0, sourceDuration - (window.startTime ?? 0));
    return configured === undefined ? remaining : Math.min(remaining, configured);
  }
  return configured ?? 0;
}

export class ProgressStreamParser {
  private remainder = '';

  constructor(private readonly duration: number) {}

  write(chunk: string): Progress[] {
    const parts = `${this.remainder}${chunk}`.split(/\r\n|[\r\n]/);
    this.remainder = parts.pop() ?? '';
    if (this.remainder.length > 64 * 1024) this.remainder = this.remainder.slice(-64 * 1024);
    return parts
      .map((line) => parseProgress(line, this.duration))
      .filter((progress): progress is Progress => progress !== undefined);
  }

  flush(): Progress[] {
    const progress = parseProgress(this.remainder, this.duration);
    this.remainder = '';
    return progress ? [progress] : [];
  }
}

export function parseProgress(chunk: string, duration: number): Progress | undefined {
  const timeMatch = /time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(chunk);
  if (!timeMatch) return undefined;
  const time = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
  const frames = /frame=\s*(\d+)/.exec(chunk)?.[1];
  const fps = /fps=\s*([\d.]+)/.exec(chunk)?.[1];
  const speed = /speed=\s*([\d.]+)x/.exec(chunk)?.[1];
  const progress: Progress = { time };
  if (frames) progress.frames = Number(frames);
  if (fps) progress.fps = Number(fps);
  if (speed) progress.speed = Number(speed);
  if (duration > 0) progress.percent = Math.min(100, (time / duration) * 100);
  return progress;
}
