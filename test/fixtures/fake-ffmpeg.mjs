#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--stdout')) console.log('stdout fixture');
if (args.includes('--large-output')) {
  console.log(`START-${'x'.repeat(4096)}-STDOUT-END`);
  console.error(`START-${'y'.repeat(4096)}-STDERR-END`);
}
if (args.includes('--exit-seven')) {
  console.error('accepted exit fixture');
  process.exit(7);
}

if (args.includes('-formats')) {
  console.log('configuration: --enable-libmp3lame --enable-libx264');
  console.log('File formats:');
  console.log(' DE matroska,webm Matroska / WebM');
  console.log('  E mp4 MP4');
  console.log(' D  mov QuickTime');
  process.exit(0);
}

if (args.includes('-encoders')) {
  if (process.env.CONFIG_DELAY) {
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.CONFIG_DELAY)));
  }
  console.log('Encoders:');
  console.log(' V..... libx264 H.264');
  console.log(' A..... libmp3lame MP3');
  console.log(' A..... aac AAC');
  console.log(' V..... mjpeg Motion JPEG');
  if (process.env.CONFIG_CODEC) console.log(` V..... ${process.env.CONFIG_CODEC} Test codec`);
  process.exit(0);
}

const output = args.at(-1);
if (!output) process.exit(2);
if (output.includes('forced-failure')) {
  console.error('forced failure');
  process.exit(9);
}
if (output.includes('forced-slow')) {
  console.error('diagnostic before slow process');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (output.includes('process-tree')) {
  const marker = `${output}.child`;
  const script = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 300)`;
  spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
  console.error('spawned descendant');
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.error('frame=   10 fps=25.0 time=00:00:05.00 speed=2.0x');
await mkdir(dirname(output), { recursive: true });
if (output.includes('%d')) {
  await writeFile(output.replace('%d', '1'), JSON.stringify(args));
  await writeFile(output.replace('%d', '2'), JSON.stringify(args));
} else {
  await writeFile(output, JSON.stringify(args));
}
