# node-ffmpeg

A small, typed Node.js wrapper around the FFmpeg and ffprobe command-line tools. It keeps the
original `ffmpeg` package API—Promise or callback construction, chainable setters, conversion,
frame extraction, audio extraction, and watermarks—while using modern Node.js primitives.

## Requirements

- Node.js 24 or newer
- `ffmpeg` and `ffprobe` on `PATH`, or explicit executable paths

The package intentionally does not download binaries. This keeps installation small and lets the
application choose the FFmpeg build and codecs it needs.

```sh
npm install ffmpeg
```

## Quick start

```ts
import ffmpeg from 'ffmpeg';

const video = await ffmpeg('/media/input.mp4');

video.on('progress', ({ percent, time }) => {
  console.log(`${percent?.toFixed(1)}% (${time}s)`);
});

await video
  .setVideoCodec('libx264')
  .setVideoBitRate(2_000)
  .setAudioCodec('aac')
  .setAudioBitRate(192)
  .setVideoSize('1280x?', true, true, 'black')
  .save('/media/output.mp4');
```

CommonJS remains callable, as in `0.0.4`:

```js
const ffmpeg = require('ffmpeg');
const video = await new ffmpeg('/media/input.mp4');
await video.setVideoCodec('copy').setAudioCodec('copy').save('/media/copy.mp4');
```

The legacy callback API also remains available:

```js
new ffmpeg('/media/input.mp4', (error, video) => {
  if (error) return console.error(error);
  video.save('/media/output.mp4', (saveError, output) => {
    if (saveError) console.error(saveError);
    else console.log(output);
  });
});
```

For new TypeScript code, the named factory is the clearest form:

```ts
import { create } from 'ffmpeg';

const video = await create('/media/input.mp4', {
  timeout: 120_000,
  overwrite: true,
});
```

## Executable paths

Set paths globally for legacy applications:

```ts
ffmpeg.bin = '/opt/ffmpeg/bin/ffmpeg';
ffmpeg.ffprobeBin = '/opt/ffmpeg/bin/ffprobe';
```

Or per operation:

```ts
await ffmpeg('/media/input.mp4', {
  ffmpegPath: '/opt/ffmpeg/bin/ffmpeg',
  ffprobePath: '/opt/ffmpeg/bin/ffprobe',
});
```

When an absolute `ffmpegPath` is supplied and `ffprobePath` is omitted, a sibling `ffprobe`
executable is inferred. URLs such as HTTP, HTTPS, RTSP, and other protocols supported by the
installed FFmpeg build are accepted as inputs.

## Settings

| Setting       | Default   | Meaning                                                       |
| ------------- | --------- | ------------------------------------------------------------- |
| `encoding`    | `utf8`    | Process output encoding                                       |
| `timeout`     | `0`       | Maximum operation time in milliseconds; `0` disables it       |
| `maxBuffer`   | 16 MiB    | Retained stdout/stderr tail; reaching it does not kill FFmpeg |
| `overwrite`   | `false`   | Use `-y`; otherwise `-n` prevents interactive hangs           |
| `ffmpegPath`  | `ffmpeg`  | FFmpeg executable                                             |
| `ffprobePath` | `ffprobe` | ffprobe executable                                            |
| `signal`      | —         | `AbortSignal` used to cancel an operation                     |
| `cwd`, `env`  | inherited | Child-process working directory and environment               |

## API

All setters are chainable:

- Video: `setDisableVideo`, `setVideoFormat`, `setVideoCodec`, `setVideoBitRate`,
  `setVideoFrameRate`, `setVideoStartTime`, `setVideoDuration`, `setVideoAspectRatio`,
  `setVideoSize`, `setVideoQuality`
- Audio: `setDisableAudio`, `setAudioCodec`, `setAudioFrequency`, `setAudioChannels`,
  `setAudioBitRate`, `setAudioQuality`
- General: `setMetadata`, `setThreads`, `setWatermark`, `addInput`, `addCommand`,
  `addOutputOption`, `addFilterComplex`, `getCommand`
- Execution: `save`, `fnExtractSoundToMP3`, `fnExtractFrameToJPG`, `fnAddWatermark`

`copy` is accepted by both codec setters. Repeated custom options such as multiple `-map` or
`-metadata` entries are supported.

### Metadata

`video.metadata` preserves the original package shape (`duration`, `video`, `audio`, and common
tags) and adds the complete ffprobe response at `video.metadata.raw`. Available formats and
encoders are exposed at `video.info_configuration`.

### Progress and lifecycle events

```ts
video.on('start', (command) => console.log(command));
video.on('progress', (progress) => console.log(progress.percent));
video.on('stderr', (chunk) => process.stderr.write(chunk));
video.on('end', (result) => console.log(result.code));
video.on('error', (error) => console.error(error)); // optional
```

An `error` listener is optional: failed Promise operations reject normally instead of causing an
unhandled EventEmitter error.

### Frame extraction

```ts
const files = await video.fnExtractFrameToJPG('/media/frames', {
  start_time: '00:00:10',
  every_n_seconds: 5,
  number: 10,
  size: '640x?',
  quality: 2,
  file_name: 'preview_%s',
});
```

Only one of `every_n_frames`, `every_n_seconds`, or `every_n_percentage` may be set. Returned paths
are limited to files matching the extraction pattern, rather than every file in the directory.

### Custom FFmpeg options

```ts
await video
  .addCommand('-movflags', '+faststart')
  .addCommand('-map', '0:v:0')
  .addCommand('-map', '0:a:0?')
  .save('/media/output.mp4');
```

Arguments are passed directly to `spawn` with `shell: false`; do not add shell quotes.

## Migrating from 0.0.4

- Node.js 24+ and ffprobe are now required.
- Native Promises replace `when`; normal `await` and `.then()` usage is unchanged.
- Errors are `FfmpegError` instances with the historical numeric `code` and `msg` fields.
- Watermark compass positions now follow their conventional meaning (for example, `NE` is
  top-right). This fixes the old east/west inversion.
- Bitrates use modern stream-specific flags (`-b:v` and `-b:a`); numeric values are interpreted as
  kbit/s.
- Existing outputs are protected with `-n`. Set `overwrite: true` to use `-y`.
- The project publishes both ESM and CommonJS and includes its own TypeScript declarations;
  `@types/ffmpeg` is no longer needed.

See [AUDIT.md](AUDIT.md) for the code and issue audit and [CHANGELOG.md](CHANGELOG.md) for the
release summary.

## Security

FFmpeg processes untrusted and highly complex media. Keep the system FFmpeg build patched, apply
resource limits appropriate to your service, and see [SECURITY.md](SECURITY.md) before accepting
untrusted input.

## License

MIT © Damiano Ciarla
