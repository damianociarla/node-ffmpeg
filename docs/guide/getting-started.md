# Getting started

`node-ffmpeg` is a typed Node.js interface around the FFmpeg and ffprobe command-line tools. It does
not bundle a binary: your application stays in control of the FFmpeg build, codecs, and protocols it
uses.

## Requirements

- Node.js 24 or newer
- `ffmpeg` and `ffprobe` on `PATH`, or explicit executable paths

```sh
npm install ffmpeg
```

## Your first pipeline

```ts
import ffmpeg from 'ffmpeg';

const video = await ffmpeg('/media/input.mp4');

await video
  .setVideoCodec('libx264')
  .setVideoBitRate(2_000)
  .setAudioCodec('aac')
  .setAudioBitRate(192)
  .save('/media/output.mp4');
```

The initial `await` probes the source and the local FFmpeg capabilities. The returned `Video`
instance holds normalized metadata and a chainable output pipeline.

## Modern named factory

New TypeScript applications can use the explicit `create` export:

```ts
import { create } from 'ffmpeg';

const video = await create('/media/input.mp4', {
  overwrite: true,
  timeout: 120_000,
});
```

## Reuse an isolated client

Services that open several files with the same FFmpeg installation can inspect capabilities once:

```ts
import { createClient } from 'ffmpeg';

const client = await createClient({
  ffmpegPath: '/opt/ffmpeg/bin/ffmpeg',
  ffprobePath: '/opt/ffmpeg/bin/ffprobe',
  overwrite: true,
});

const first = await client.open('/media/first.mp4');
const second = await client.open('/media/second.mp4', { timeout: 30_000 });
```

Each client snapshots its executable paths, working directory, and environment. Its capability data
is inspected once and cloned for every `Video`, so separate clients cannot contaminate one another.

## CommonJS and the classic constructor

The historical callable CommonJS export remains intact:

```js
const ffmpeg = require('ffmpeg');

const video = await new ffmpeg('/media/input.mp4');
await video.setVideoCodec('copy').setAudioCodec('copy').save('/media/remuxed.mkv');
```

## Read the source

Every `Video` exposes both a stable metadata model and the complete ffprobe response:

```ts
console.log(video.metadata.duration.seconds);
console.log(video.metadata.video.resolution);
console.log(video.metadata.audio.codec);
console.log(video.metadata.raw);
```

Next, configure [executable paths and process behavior](./configuration).
