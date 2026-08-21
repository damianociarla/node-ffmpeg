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

| Setting       | Default   | Purpose                                                  |
| ------------- | --------- | -------------------------------------------------------- |
| `ffmpegPath`  | `ffmpeg`  | FFmpeg executable                                        |
| `ffprobePath` | `ffprobe` | ffprobe executable                                       |
| `overwrite`   | `false`   | Use `-y`; otherwise `-n` protects existing files         |
| `timeout`     | `0`       | Maximum operation time in milliseconds; zero disables it |
| `maxBuffer`   | 16 MiB    | Conversion output tail and maximum complete probe output |
| `signal`      | —         | AbortSignal for probes and conversions                   |
| `encoding`    | `utf8`    | Process output encoding                                  |
| `cwd`, `env`  | inherited | Child working directory and environment                  |

## Global executable paths

```ts
ffmpeg.bin = '/opt/ffmpeg/bin/ffmpeg';
ffmpeg.ffprobeBin = '/opt/ffmpeg/bin/ffprobe';
```

When `ffmpegPath` is absolute and no explicit ffprobe override exists, a sibling `ffprobe` binary is
inferred.

Conversions keep a bounded tail and continue when the limit is reached. Configuration and ffprobe
stdout cannot be truncated safely, so those operations fail with error `119` when their complete
output exceeds `maxBuffer`.

## Per-instance clients

`createClient(settings)` creates an isolated, reusable FFmpeg context. It inspects formats and
encoders once; every `client.open(input, settings)` then runs only ffprobe. Per-open settings are
limited to `encoding`, `timeout`, `maxBuffer`, `overwrite`, and `signal`. Executable paths, `cwd`, and
`env` stay fixed so the cached capabilities always describe the processes that will be launched.

The signal passed to `createClient` controls the client lifetime. Aborting it cancels every active
open or conversion from that client. A signal passed to `open` cancels only that media operation.

## Cancellation

```ts
const controller = new AbortController();
const video = await ffmpeg(input, { signal: controller.signal });

setTimeout(() => controller.abort(), 10_000);
await video.save(output);
```

Cancellation rejects with an `FfmpegError` whose historical numeric code is `117`.

Parallel initialization processes are owned as a group: if probing or capability inspection fails,
the remaining children are cancelled and awaited before the original error is returned.
