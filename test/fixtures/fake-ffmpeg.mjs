#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const args = process.argv.slice(2);

if (args.includes('-formats')) {
  console.log('configuration: --enable-libmp3lame --enable-libx264');
  console.log('File formats:');
  console.log(' DE matroska,webm Matroska / WebM');
  console.log('  E mp4 MP4');
  console.log(' D  mov QuickTime');
  process.exit(0);
}

if (args.includes('-encoders')) {
  console.log('Encoders:');
  console.log(' V..... libx264 H.264');
  console.log(' A..... libmp3lame MP3');
  console.log(' A..... aac AAC');
  console.log(' V..... mjpeg Motion JPEG');
  process.exit(0);
}

const output = args.at(-1);
if (!output) process.exit(2);
if (output.includes('forced-failure')) {
  console.error('forced failure');
  process.exit(9);
}
if (output.includes('forced-slow')) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.error('frame=   10 fps=25.0 time=00:00:05.00 speed=2.0x');
await mkdir(dirname(output), { recursive: true });
if (output.includes('%d')) {
  await writeFile(output.replace('%d', '1'), 'frame 1');
  await writeFile(output.replace('%d', '2'), 'frame 2');
} else {
  await writeFile(output, JSON.stringify(args));
}
