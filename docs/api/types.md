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
