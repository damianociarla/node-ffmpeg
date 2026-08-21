# Media Processing Context

This context describes how node-ffmpeg turns one inspected media source into one or more FFmpeg operations while preserving its historical fluent interface.

## Language

**Media Input**:
A local file or hierarchical URL that is inspected before any transformation begins.
_Avoid_: Source file, input filepath

**Video Builder**:
The mutable, chainable description of the next media transformation requested from a `Video`.
_Avoid_: Command builder, options object

**Operation Plan**:
An immutable snapshot containing the executable arguments and progress model for one media operation.
_Avoid_: Args snapshot, command state

**Media Operation**:
One observable FFmpeg execution created from an Operation Plan, including its Promise or callback outcome and lifecycle events.
_Avoid_: Conversion job, process run
