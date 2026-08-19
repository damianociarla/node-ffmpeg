# Custom commands

The typed setters cover common operations. The escape hatches expose the full FFmpeg CLI without
falling back to shell strings.

## Output arguments

```ts
await video
  .addOutputOption('-movflags', '+faststart')
  .addCommand('-preset', 'slow')
  .addCommand('-crf', 20)
  .save(output);
```

## Repeated mapping

```ts
video
  .addInput('/media/voiceover.wav')
  .addCommand('-map', '0:v:0')
  .addCommand('-map', '1:a:0')
  .addCommand('-shortest');
```

## Complex filters

```ts
video
  .addInput('/media/overlay.png')
  .addFilterComplex('[1:v]scale=240:-1[logo]')
  .addFilterComplex('[0:v][logo]overlay=W-w-24:24[out]')
  .addCommand('-map', '[out]');
```

Each command and value is a distinct process argument. Passing `'-crf 20'` as one string is not
equivalent to `.addCommand('-crf', 20)`.

## Remote inputs

Any protocol supported by the installed FFmpeg build can be used:

```ts
const stream = await ffmpeg('rtsp://camera.example/live');
await stream.setVideoDuration(10).save('/media/capture.mp4');
```

Use deployment-level protocol and network restrictions when processing untrusted URLs.
