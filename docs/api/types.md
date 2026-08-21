# Metadata and types

The package ships strict first-party declarations for every public setting, callback, event, metadata
field, and return value.

## Stable metadata

```ts
interface MediaMetadata {
  filename: string;
  title: string;
  artist: string;
  duration: { raw: string; seconds: number };
  video: {
    codec: string;
    bitrate: number;
    fps: number;
    resolution: { w: number; h: number };
    aspect: Partial<Ratio>;
    rotate: number;
  };
  audio: {
    codec: string;
    bitrate: number;
    sample_rate: number;
    channels: { raw: string; value: number };
  };
  raw: FfprobeResult;
}
```

The stable portion preserves the original package's shape. `raw` makes every field returned by the
installed ffprobe version available for advanced use cases.

## FFmpeg capabilities

```ts
video.info_configuration.formats.encode;
video.info_configuration.formats.decode;
video.info_configuration.codecs.encode;
video.info_configuration.modules;
```

Format setters validate against writable formats; codec setters validate against actual encoders.
`copy` remains available independently of encoder discovery.

An `FfmpegClient` exposes a cloned `configuration` snapshot plus `open(input, settings)`. This is the
recommended type for long-lived services that need stable, per-tenant process settings without
repeating capability inspection.

## Media operations

```ts
type MediaOperationKind = 'save' | 'audio' | 'frames' | 'watermark';

interface MediaOperationContext {
  readonly operationId: string;
  readonly kind: MediaOperationKind;
  readonly destination: string;
}
```

The same frozen context is passed as the second argument of every event belonging to one terminal
operation. It allows concurrent event streams on a shared `Video` to be correlated without changing
the historical first event argument.

## Errors

```ts
import { FfmpegError } from 'ffmpeg';

try {
  await video.save(output);
} catch (error) {
  if (error instanceof FfmpegError) {
    console.error(error.code, error.msg, error.stderr);
  }
}
```

Every package error preserves its historical numeric `code`, a human-readable `message`/`msg`, and
optional `stderr` and `cause` diagnostics.

| Code | Meaning                                              |
| ---: | ---------------------------------------------------- |
|  100 | Empty input path                                     |
|  101 | Input path is not a string                           |
|  102 | Unknown setting or option name                       |
|  103 | Local input does not exist                           |
|  104 | Output format is unavailable                         |
|  105 | Invalid audio channel count                          |
|  106 | Frame destination directory could not be created     |
|  107 | Conflicting or invalid frame interval selector       |
|  108 | Watermark does not exist                             |
|  109 | Invalid watermark position                           |
|  110 | Invalid size expression                              |
|  111 | Square-pixel resolution is unavailable               |
|  112 | Reserved legacy duplicate-command error              |
|  113 | Encoder is unavailable                               |
|  114 | Executable could not start                           |
|  115 | FFmpeg/ffprobe returned an unsuccessful exit code    |
|  116 | Process timed out                                    |
|  117 | Process was aborted                                  |
|  118 | ffprobe JSON is invalid                              |
|  119 | Complete process output exceeded `maxBuffer`         |
|  120 | Invalid numeric option                               |
|  121 | Invalid time expression                              |
|  122 | Invalid aspect ratio                                 |
|  123 | Invalid setting value or container                   |
|  124 | Output path could be interpreted as an FFmpeg option |
|  125 | Unsafe or invalid FFmpeg color expression            |

Operational validation errors from terminal methods reject their Promise or reach their callback.
Input/settings validation in `ffmpeg()`, `new ffmpeg()`, `create()` and `client.open()`, plus setter
and `getCommand()` preview validation, is synchronous.
