# Video pipeline

The `Video` instance is both the normalized view of an input and a mutable builder for the next
FFmpeg operation. Setters return the same instance for fluent composition.

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

After an operation completes or fails, accumulated inputs, filters, commands, and setters are reset.
