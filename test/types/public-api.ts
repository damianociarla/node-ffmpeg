import type {
  ExtractFrameSettings,
  LegacyCallback,
  Video,
  WatermarkSettings,
} from '../../src/index.js';

// Compile-only contract tests. This function is intentionally never called.
export function verifyPublicVideoOverloads(
  video: Video,
  stringCallback: LegacyCallback<string>,
  framesCallback: LegacyCallback<string[]>,
  watermarkSettings: WatermarkSettings,
  frameSettings: ExtractFrameSettings,
): void {
  const save: Promise<string> = video.save('output.mp4');
  video.save('output.mp4', stringCallback);

  const audio: Promise<string> = video.fnExtractSoundToMP3('output.mp3');
  video.fnExtractSoundToMP3('output.mp3', stringCallback);

  const frames: Promise<string[]> = video.fnExtractFrameToJPG('frames');
  const configuredFrames: Promise<string[]> = video.fnExtractFrameToJPG('frames', frameSettings);
  video.fnExtractFrameToJPG('frames', framesCallback);
  video.fnExtractFrameToJPG('frames', frameSettings, framesCallback);

  const watermark: Promise<string> = video.fnAddWatermark('logo.png');
  const configuredWatermark: Promise<string> = video.fnAddWatermark('logo.png', watermarkSettings);
  const destinationWatermark: Promise<string> = video.fnAddWatermark('logo.png', 'output.mp4');
  const configuredDestinationWatermark: Promise<string> = video.fnAddWatermark(
    'logo.png',
    'output.mp4',
    watermarkSettings,
  );
  video.fnAddWatermark('logo.png', stringCallback);
  video.fnAddWatermark('logo.png', watermarkSettings, stringCallback);
  video.fnAddWatermark('logo.png', 'output.mp4', stringCallback);
  video.fnAddWatermark('logo.png', 'output.mp4', watermarkSettings, stringCallback);

  video.on('progress', (progress) => void progress.percent);
  video.on('progress', (progress, operation) => {
    void progress.percent;
    void operation.operationId;
    void operation.kind;
    void operation.destination;
    // @ts-expect-error Operation Context values are immutable.
    operation.operationId = 'replacement';
  });

  void [
    save,
    audio,
    frames,
    configuredFrames,
    watermark,
    configuredWatermark,
    destinationWatermark,
    configuredDestinationWatermark,
  ];
}
