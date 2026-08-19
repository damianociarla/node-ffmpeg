# Migrating from 0.0.4

Version 1 is a new implementation behind a familiar API. Most Promise, callback, and setter-based
code continues to work, while unsafe and ambiguous behavior has been corrected.

## Runtime changes

- Node.js 24 and ffprobe are required.
- Native Promises replace `when`.
- Errors are real `FfmpegError` instances with the legacy numeric `code` and `msg` properties.
- Both ESM and callable CommonJS exports are included.
- TypeScript declarations ship with the package; remove `@types/ffmpeg`.

## Behavior changes

### Paths are arguments, not shell fragments

Do not add quotes around paths or custom values:

```ts
video.addCommand('-metadata', 'title=My title');
```

### Existing output is protected

The default is now `-n`, preventing an interactive FFmpeg prompt. Use `{ overwrite: true }` when an
existing destination should be replaced.

### Bitrates are stream-specific

Numeric values are interpreted as kbit/s and emitted through `-b:v` and `-b:a`.

### Watermark positions are conventional

`NE` now means top-right and `SW` means bottom-left. This intentionally fixes the old east/west
inversion.

## Callback compatibility

```js
new ffmpeg(input, (error, video) => {
  if (error) return console.error(error);
  video.save(output, (saveError, file) => {
    if (saveError) console.error(saveError);
    else console.log(file);
  });
});
```

For the full rationale and issue disposition, read the repository's
[technical audit](https://github.com/damianociarla/node-ffmpeg/blob/main/AUDIT.md).
