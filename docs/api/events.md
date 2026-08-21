# Events

Every `Video` is a typed EventEmitter. Events provide process visibility without changing Promise
semantics.

```ts
video.on('start', (command, operation) => console.log(operation.operationId, command));
video.on('stderr', (chunk, operation) =>
  process.stderr.write(`[${operation.operationId}] ${chunk}`),
);
video.on('progress', ({ frames, fps, time, speed, percent }, operation) => {
  console.log(operation.destination, { frames, fps, time, speed, percent });
});
video.on('end', ({ code, args }, operation) => console.log(operation.operationId, code, args));
video.on('error', (error, operation) => console.error(operation.operationId, error));

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

## Operation correlation

Every lifecycle event preserves its historical first argument and adds the same immutable context as
its second argument:

```ts
interface MediaOperationContext {
  readonly operationId: string;
  readonly kind: 'save' | 'audio' | 'frames' | 'watermark';
  readonly destination: string;
}
```

`operationId` is a UUID created when the terminal method is invoked. `destination` is the final output
path for save, audio, and watermark operations, or the destination folder for frame extraction. MP3
destinations are normalized before the context is created.

Listeners that only accept the historical first argument remain valid. When operations overlap, group
their events by `operationId`; ordering remains stable within each operation.

An `error` listener is optional. Without one, a failed operation rejects its Promise normally instead
of triggering an unhandled EventEmitter exception.

Planning, filesystem, and process failures all emit `error` with their Operation Context when a
listener exists. Terminal-method callbacks are always asynchronous.

Progress uses the effective output duration. `setVideoStartTime()` subtracts the skipped portion and
`setVideoDuration()` caps the denominator; when only an explicit duration is known, it is used. The
percentage is capped at 100 and remains `undefined` when no reliable duration is available.

## Process results

The `end` event receives the executable, exact arguments, exit code, and retained stdout/stderr.
Conversion output is tailed to `maxBuffer`; exceeding that limit never kills a long conversion. Probe
and configuration operations require complete stdout and fail with error `119` when the same limit is
exceeded.
