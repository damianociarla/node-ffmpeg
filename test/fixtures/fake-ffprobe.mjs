#!/usr/bin/env node

import { appendFile } from 'node:fs/promises';

const input = process.argv.at(-1) ?? '';
if (process.env.INVOCATION_LOG) {
  await appendFile(
    process.env.INVOCATION_LOG,
    `${JSON.stringify({ executable: 'ffprobe', args: process.argv.slice(2) })}\n`,
  );
}
if (input.includes('invalid-json')) {
  console.log('{this is not json');
  process.exit(0);
}
if (input.includes('probe-failure')) {
  console.error('probe failed intentionally');
  process.exit(8);
}
if (input.includes('probe-slow')) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (input.includes('large-json')) {
  console.log(
    JSON.stringify({ padding: 'x'.repeat(4096), streams: [], format: { filename: input } }),
  );
  process.exit(0);
}
console.log(
  JSON.stringify({
    streams: [
      {
        index: 0,
        codec_name: 'h264',
        codec_type: 'video',
        width: 1920,
        height: 1080,
        bit_rate: '4000000',
        avg_frame_rate: '25/1',
        sample_aspect_ratio: '1:1',
        display_aspect_ratio: '16:9',
        tags: { rotate: '90' },
      },
      {
        index: 1,
        codec_name: 'aac',
        codec_type: 'audio',
        bit_rate: '192000',
        sample_rate: '48000',
        channels: 2,
        channel_layout: 'stereo',
      },
    ],
    format: {
      filename: input,
      format_name: 'matroska,webm',
      duration: '10.5',
      start_time: '0',
      bit_rate: '4192000',
      tags: { title: 'Fixture', artist: 'node-ffmpeg' },
    },
  }),
);
