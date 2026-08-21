# node-ffmpeg

[Documentation](https://damianociarla.github.io/node-ffmpeg/) · [API reference](https://damianociarla.github.io/node-ffmpeg/api/video) · [Migration guide](https://damianociarla.github.io/node-ffmpeg/guide/migration)

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
  console.log(percent === undefined ? `${time}s` : `${percent.toFixed(1)}% (${time}s)`);
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

For services that process several files with one fixed FFmpeg installation, inspect capabilities
once with an isolated client:

```ts
import { createClient } from 'ffmpeg';

const client = await createClient({ overwrite: true, timeout: 120_000 });
const video = await client.open('/media/input.mp4');
```

Client executable paths, environment, and working directory are snapshotted at creation. Per-open
settings may adjust timeout, buffering, overwrite behavior, encoding, and cancellation without
invalidating the cached capabilities.

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
executable is inferred. Hierarchical URLs such as HTTP, HTTPS, and RTSP are accepted as inputs when
supported by the installed FFmpeg build. Non-hierarchical virtual inputs, stdin (`-`), and Node.js
streams are not supported as primary inputs because initialization probes the source first.

## Settings

| Setting       | Default   | Meaning                                                  |
| ------------- | --------- | -------------------------------------------------------- |
| `encoding`    | `utf8`    | Process output encoding                                  |
| `timeout`     | `0`       | Maximum operation time in milliseconds; `0` disables it  |
| `maxBuffer`   | 16 MiB    | Conversion output tail and maximum complete probe output |
| `overwrite`   | `false`   | Use `-y`; otherwise `-n` prevents interactive hangs      |
| `ffmpegPath`  | `ffmpeg`  | FFmpeg executable                                        |
| `ffprobePath` | `ffprobe` | ffprobe executable                                       |
| `signal`      | —         | `AbortSignal` used to cancel an operation                |
| `cwd`, `env`  | inherited | Child-process working directory and environment          |

Long-running conversions retain only the most recent `maxBuffer` bytes of stdout and stderr. Probe
and configuration output must remain complete: if stdout exceeds the limit, the operation fails with
error `119` instead of parsing a truncated document.

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

Terminal methods consume the current fluent options at invocation. Their validation and process
errors always arrive through Promise rejection or the optional callback. Input/settings validation
performed by `ffmpeg()`, `new ffmpeg()`, `create()` and `client.open()` remains synchronous, as do
setters and `getCommand()`. Concurrent operations on one `Video` use isolated option snapshots. Their
shared lifecycle events may interleave, but every event includes an immutable operation context for
correlation.

### Metadata

`video.metadata` preserves the original package shape (`duration`, `video`, `audio`, and common
tags) and adds the complete ffprobe response at `video.metadata.raw`. Available formats and
encoders are exposed at `video.info_configuration`.

### Progress and lifecycle events

```ts
video.on('start', (command) => console.log(command));
video.on('progress', (progress, operation) => {
  console.log(operation.operationId, operation.destination, progress.percent);
});
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
Custom input, command, output-option, and filter methods are trusted escape hatches and must not
receive unvalidated user strings. Output destinations beginning with `-` are rejected; use an
explicit `./-name.ext` or absolute path when the filename intentionally starts with a dash.

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
