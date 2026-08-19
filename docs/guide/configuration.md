# Configuration

Settings can be applied per input. Legacy applications may also configure executable paths globally.

## Per-operation settings

```ts
const video = await ffmpeg(input, {
  ffmpegPath: '/opt/ffmpeg/bin/ffmpeg',
  ffprobePath: '/opt/ffmpeg/bin/ffprobe',
  overwrite: true,
  timeout: 90_000,
  maxBuffer: 32 * 1024 * 1024,
  signal: abortController.signal,
});
```

| Setting       | Default   | Purpose                                                     |
| ------------- | --------- | ----------------------------------------------------------- |
| `ffmpegPath`  | `ffmpeg`  | FFmpeg executable                                           |
| `ffprobePath` | `ffprobe` | ffprobe executable                                          |
| `overwrite`   | `false`   | Use `-y`; otherwise `-n` protects existing files            |
| `timeout`     | `0`       | Maximum operation time in milliseconds; zero disables it    |
| `maxBuffer`   | 16 MiB    | Retained stdout/stderr tail without terminating the process |
| `signal`      | —         | AbortSignal for probes and conversions                      |
| `encoding`    | `utf8`    | Process output encoding                                     |
| `cwd`, `env`  | inherited | Child working directory and environment                     |

## Global executable paths

```ts
ffmpeg.bin = '/opt/ffmpeg/bin/ffmpeg';
ffmpeg.ffprobeBin = '/opt/ffmpeg/bin/ffprobe';
```

When `ffmpegPath` is absolute and no explicit ffprobe override exists, a sibling `ffprobe` binary is
inferred.

## Cancellation

```ts
const controller = new AbortController();
const video = await ffmpeg(input, { signal: controller.signal });

setTimeout(() => controller.abort(), 10_000);
await video.save(output);
```

Cancellation rejects with an `FfmpegError` whose historical numeric code is `117`.
