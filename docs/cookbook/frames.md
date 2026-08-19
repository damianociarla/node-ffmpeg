# Extract frames

The frame preset creates JPEGs and returns only files matching the generated output pattern.

```ts
const files = await video.fnExtractFrameToJPG('/media/frames', {
  start_time: '00:00:10',
  duration_time: 30,
  every_n_seconds: 5,
  number: 6,
  size: '640x?',
  quality: 2,
  file_name: 'preview_%s',
});
```

## Sampling modes

Choose exactly one:

- `every_n_frames`: capture every N decoded frames
- `every_n_seconds`: capture at a time interval
- `every_n_percentage`: divide the source by a percentage interval

Combining modes rejects with error code `107` instead of creating an ambiguous filter.

## Size expressions

| Expression | Result                         |
| ---------- | ------------------------------ |
| `640x360`  | Exact dimensions               |
| `640x?`    | Fixed width, calculated height |
| `?x360`    | Calculated width, fixed height |
| `50%`      | Half the source dimensions     |

Odd dimensions are rounded down to an even number for codec compatibility.

## Filename replacements

- `%t`: current timestamp
- `%s`: requested size
- `%x`: requested width expression
- `%y`: requested height expression

The frame sequence suffix is added automatically.
