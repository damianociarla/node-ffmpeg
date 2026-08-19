# Watermarks

Watermarks use a second FFmpeg input and an overlay filter. Compass positions follow their ordinary
meaning.

```ts
await video.fnAddWatermark('/media/brand.png', '/media/branded.mp4', {
  position: 'NE',
  margin_nord: 24,
  margin_east: 24,
});
```

## Positions

`NW`, `NC`, `NE`, `CW`, `C`, `CE`, `SW`, `SC`, and `SE` cover the nine anchor points.

Margins retain their historical names:

- `margin_nord`: top
- `margin_sud`: bottom
- `margin_east`: right
- `margin_west`: left

## Compose before saving

```ts
await video
  .setWatermark('/media/brand.png', { position: 'SW', margin_west: 20, margin_sud: 20 })
  .setVideoCodec('libx264')
  .save('/media/branded.mp4');
```

Input paths are passed directly to the process and must not be shell-quoted.
