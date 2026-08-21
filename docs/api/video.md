# Video pipeline

The `Video` instance is both the normalized view of an input and a mutable builder for the next
FFmpeg operation. Setters return the same instance for fluent composition.

## Invocation contract

Setters and `getCommand()` validate synchronously. Terminal methods—`save()`, MP3 extraction, frame
extraction, and watermarking—never throw operational validation errors in the caller's stack. Their
Promise overload rejects; their callback overload calls `(error, null)` asynchronously and exactly
once.

Calling a terminal method atomically consumes the current builder state, even when planning or
execution later fails. Setters called afterward belong to the next operation. This makes concurrent
operations on one `Video` state-safe:

```ts
const first = video.setVideoCodec('libx264').save('/media/first.mp4');
const second = video.setAudioCodec('aac').save('/media/second.mp4');

await Promise.all([first, second]);
```

Each operation receives its own inputs, filters, commands, options, progress parser, and result.
Lifecycle events still share the `Video` emitter and may interleave when operations overlap. Every
event receives an immutable `MediaOperationContext` as its second argument, so consumers can group
events by `operationId` or `destination`.

## Complete method reference

### Video methods

| Method                                                                       | Parameters                            | Returns | Validation errors                                         |
| ---------------------------------------------------------------------------- | ------------------------------------- | ------- | --------------------------------------------------------- |
| `setDisableVideo()`                                                          | —                                     | `this`  | —                                                         |
| `setVideoFormat(format)`                                                     | `string`                              | `this`  | `104` unsupported format                                  |
| `setVideoCodec(codec)`                                                       | `string`                              | `this`  | `113` unsupported encoder                                 |
| `setVideoBitRate(bitrate)`                                                   | `string \| number`                    | `this`  | `120` invalid bitrate                                     |
| `setVideoFrameRate(framerate)`                                               | `number`                              | `this`  | `120` non-positive rate                                   |
| `setVideoStartTime(time)`                                                    | `string \| number`                    | `this`  | `121` invalid time                                        |
| `setVideoDuration(duration)`                                                 | `string \| number`                    | `this`  | `121` invalid duration                                    |
| `setVideoAspectRatio(aspect)`                                                | `string \| number`                    | `this`  | `122` invalid ratio                                       |
| `setVideoSize(size, keepPixelAspectRatio?, keepAspectRatio?, paddingColor?)` | `string, boolean?, boolean?, string?` | `this`  | `125` invalid color; sizing may later produce `110`/`111` |
| `setVideoQuality(quality)`                                                   | `string \| number`                    | `this`  | `120` invalid quality                                     |

### Audio methods

| Method                         | Parameters         | Returns | Validation errors            |
| ------------------------------ | ------------------ | ------- | ---------------------------- |
| `setDisableAudio()`            | —                  | `this`  | —                            |
| `setAudioCodec(codec)`         | `string`           | `this`  | `113` unsupported encoder    |
| `setAudioFrequency(frequency)` | `number`           | `this`  | `120` non-positive frequency |
| `setAudioChannels(channels)`   | `number`           | `this`  | `105` invalid channel count  |
| `setAudioBitRate(bitrate)`     | `string \| number` | `this`  | `120` invalid bitrate        |
| `setAudioQuality(quality)`     | `string \| number` | `this`  | `120` invalid quality        |

### Builder and preview methods

| Method                                | Parameters                         | Returns                      | Notes                              |
| ------------------------------------- | ---------------------------------- | ---------------------------- | ---------------------------------- |
| `setMetadata(key, value)`             | `string, string \| number`         | `this`                       | Repeatable                         |
| `setMetadata(values)`                 | `Record<string, string \| number>` | `this`                       | Adds every entry                   |
| `setThreads(threads)`                 | `number`                           | `this`                       | Error `120` when invalid           |
| `setWatermark(path, settings?)`       | `string, WatermarkSettings?`       | `this`                       | Errors `108`, `109`, `120`         |
| `addInput(input)`                     | `string`                           | `this`                       | Trusted raw argument               |
| `addCommand(command, argument?)`      | `string, string \| number?`        | `this`                       | Trusted raw argument               |
| `addOutputOption(command, argument?)` | `string, string \| number?`        | `this`                       | Alias of `addCommand`              |
| `addFilterComplex(filter)`            | `string`                           | `this`                       | Trusted raw filter                 |
| `getCommand(destination)`             | `string`                           | `{ command, args, display }` | Synchronous, non-consuming preview |

### Terminal methods

| Promise form                                    | Callback form                 | Result                  | Main errors                                            |
| ----------------------------------------------- | ----------------------------- | ----------------------- | ------------------------------------------------------ |
| `save(destination)`                             | `save(destination, callback)` | output path             | `110`–`125`, process errors `114`–`119`                |
| `fnExtractSoundToMP3(destination)`              | same plus `callback`          | normalized `.mp3` path  | `124`, process errors `114`–`119`                      |
| `fnExtractFrameToJPG(folder, settings?)`        | same plus `callback`          | generated frame paths   | `106`, `107`, `110`, `120`, `121`, `124`, `125`        |
| `fnAddWatermark(path, destination?, settings?)` | same plus `callback`          | watermarked output path | `108`, `109`, `120`, `124`, process errors `114`–`119` |

## Video setters

```ts
video
  .setDisableVideo()
  .setVideoFormat('mp4')
  .setVideoCodec('libx264')
  .setVideoBitRate(2_000)
  .setVideoFrameRate(30)
  .setVideoStartTime('00:00:10')
  .setVideoDuration(15)
  .setVideoAspectRatio('16:9')
  .setVideoSize('1280x?', true, true, 'black')
  .setVideoQuality(2);
```

Use only the setters relevant to a pipeline. `copy` is accepted as a video codec for remuxing.
Padding colors accept alphabetic FFmpeg color names and hexadecimal RGB/RGBA forms such as
`#112233`, `0x112233`, or `112233@0.5`. Filter syntax and whitespace are rejected.

## Audio setters

```ts
video
  .setDisableAudio()
  .setAudioCodec('aac')
  .setAudioFrequency(48_000)
  .setAudioChannels(2)
  .setAudioBitRate(192)
  .setAudioQuality(2);
```

`setAudioCodec('mp3')` selects `libmp3lame` when the local build exposes it.

## General output options

```ts
video
  .setMetadata({ title: 'Launch', artist: 'Studio' })
  .setThreads(4)
  .addInput('/media/voiceover.wav')
  .addFilterComplex('[0:v]scale=1280:-2[v]')
  .addCommand('-map', '[v]')
  .addOutputOption('-movflags', '+faststart');
```

Repeated arguments such as `-map` and `-metadata` are supported.

## Preview and execute

```ts
const preview = video.getCommand('/media/output.mp4');

console.log(preview.command); // executable
console.log(preview.args); // exact spawn arguments
console.log(preview.display); // human-readable preview

const output = await video.save('/media/output.mp4');
```

Accumulated inputs, filters, commands, and setters are consumed as soon as an operation is invoked.
They are not restored after a validation, filesystem, process, timeout, or abort failure.

Output paths cannot begin with `-`, which prevents FFmpeg from interpreting a destination as an
option. Prefix a relative filename deliberately named with a leading dash with `./`, for example
`./-archive.mp4`; absolute paths containing such a filename are also valid.
