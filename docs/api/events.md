# Events

Every `Video` is a typed EventEmitter. Events provide process visibility without changing Promise
semantics.

```ts
video.on('start', (command) => console.log(command));
video.on('stderr', (chunk) => process.stderr.write(chunk));
video.on('progress', ({ frames, fps, time, speed, percent }) => {
  console.log({ frames, fps, time, speed, percent });
});
video.on('end', ({ code, args }) => console.log(code, args));
video.on('error', (error) => console.error(error));

await video.save(output);
```

## Progress model

| Property  | Type      | Meaning                                        |
| --------- | --------- | ---------------------------------------------- |
| `time`    | `number`  | Encoded media time in seconds                  |
| `percent` | `number?` | Percentage when an effective duration is known |
| `frames`  | `number?` | Processed video frames                         |
| `fps`     | `number?` | Current processing rate                        |
| `speed`   | `number?` | Multiple of real-time speed                    |

An `error` listener is optional. Without one, a failed operation rejects its Promise normally instead
of triggering an unhandled EventEmitter exception.

Progress uses the effective output duration. `setVideoStartTime()` subtracts the skipped portion and
`setVideoDuration()` caps the denominator; when only an explicit duration is known, it is used. The
percentage is capped at 100 and remains `undefined` when no reliable duration is available.

## Process results

The `end` event receives the executable, exact arguments, exit code, and retained stdout/stderr.
Conversion output is tailed to `maxBuffer`; exceeding that limit never kills a long conversion. Probe
and configuration operations require complete stdout and fail with error `119` when the same limit is
exceeded.
