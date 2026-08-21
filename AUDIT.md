# Repository and issue audit

Audit performed on 2026-08-19 against `damianociarla/node-ffmpeg` at commit `c72cad9` and npm
`ffmpeg@0.0.4`.

## Executive summary

The package still has meaningful adoption, but its implementation predates modern Node.js and
FFmpeg conventions. The old release contains roughly 1,400 lines of JavaScript, no tests or CI, one
unbounded dependency (`when >=0.0.1`), 51 open issues, and 15 open pull requests. Most implementation
work dates from 2012–2016; the 2022 change only added the MIT license.

The correct modernization is a focused rewrite rather than incremental syntax conversion. The old
public workflow remains valuable: inspect a file, configure a chainable `Video`, and run a small set
of useful presets. The implementation underneath that workflow was replaced.

## Findings in the legacy implementation

### Critical

1. Commands are concatenated into a string and executed by a shell. Input and output paths, custom
   arguments, filters, and watermark paths can alter command structure. Multiple attempted quoting
   fixes conflict and double-quote some paths.
2. Process errors during initial inspection are ignored and the associated Promises are resolved as
   though inspection succeeded. Several regex results are iterated without null checks.
3. The configured `ffmpeg.bin` is used during inspection but conversion hard-codes `ffmpeg`, so a
   trusted configured binary can be replaced by a different executable from `PATH`.

### High

1. `exec` buffers all output and defaults to 200 KiB, terminating legitimate large/long jobs.
2. Any non-zero timeout kills the process after 100 ms; the configured timeout value is not used.
3. Metadata is scraped from human-readable `ffmpeg -i` text with version- and locale-sensitive regex.
4. The pixel-ratio condition uses `pixel !== 1 || pixel !== 0`, which is always true and can divide by
   zero for audio-only/unknown-resolution inputs.
5. Modern paths, Unicode, quotes, and shell metacharacters are unsafe or unreliable.

### Medium

1. Codec setters validate against container formats rather than encoders.
2. Video bitrate uses ambiguous `-b`; audio/video stream specifiers are missing.
3. The frame interval conflict check counts invalid values instead of specified values.
4. Frame extraction returns every file in the destination directory and `%x`/`%y` split dimensions
   on `:` although sizes use `x`.
5. Watermark east/west coordinates are reversed. `setVideoAspectRatio` stores an option that `save`
   never applies.
6. Duplicate commands are rejected even when FFmpeg requires repetition (`-map`, `-metadata`).
7. Synchronous filesystem operations, mutable closure state, silent coercions, and plain-object
   errors make failure handling and concurrency difficult.

### Project health

- No lockfile, tests, linting, build, release automation, CI, security policy, or compatibility matrix.
- No engine requirement and no bundled TypeScript declarations.
- README examples use obsolete JavaScript and codecs such as `libfaac`.
- npm `0.0.4` does not contain later repository fixes, creating source/package drift.

## Rewrite decisions

- Keep the npm name, callable factory, `new ffmpeg(...)`, callbacks, Promises, metadata shape,
  chainable method names, and presets.
- Require Node.js 24+ and use native Promise, EventEmitter, `spawn`, AbortSignal, and recursive mkdir.
- Use ffprobe JSON for media metadata and separately inspect FFmpeg formats and encoders.
- Pass an argument array with `shell: false`; retain only an output tail instead of killing on buffer
  growth.
- Publish zero runtime dependencies, dual ESM/CommonJS, source maps, and first-party types.
- Treat 1.0.0 as the honest semver boundary for the runtime floor and corrected behavior.

## Complete open-issue disposition

This is an implementation disposition, not an automatic closing action. Media-specific reports
should be verified against the new release before closure.

| Disposition                                                                            | Issues                                                | Result                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Directly addressed: path quoting, Unicode, binary selection, buffers, failure handling | #23, #35, #43, #49, #52, #54, #59, #72, #74, #78, #98 | Argument arrays, structured probing, configurable executables, tailed output, normal rejection                                               |
| Directly addressed: codec/format/bitrate/options                                       | #30, #32, #40, #47, #65, #71, #75, #79, #89, #91, #96 | Stream-specific flags, real encoder lists, codec copy, metadata, quality, duration, repeated options                                         |
| Directly addressed: frames, watermark, filesystem, progress                            | #11, #28, #33, #55, #56, #97                          | Filter validation/results fixed, recursive mkdir uses current Node semantics, compass coordinates corrected, lifecycle/progress events added |
| Supported through the general API                                                      | #17, #25, #39, #64, #92, #99                          | Multiple inputs, arbitrary output/filter options, audio replacement, threads, drawtext/subtitle arguments                                    |
| Input/protocol support improved; scenario still needs integration verification         | #4, #14, #46, #67                                     | Hierarchical URL inputs are accepted; stdin, virtual protocols, and Node streams are explicitly unsupported as primary inputs                |
| Likely fixed or diagnosable but dependent on source media/local FFmpeg                 | #61, #63, #80, #95, #102                              | Errors now include stderr; performance and media-specific reports need reproduction before closure                                           |
| Feature request not included as a dedicated preset                                     | #38                                                   | Concatenation can be built with custom inputs/options; a validated concat preset remains future work                                         |
| Distribution/project administration                                                    | #34, #42, #48, #77, #93, #100                         | Documented requirements and license; npm publish, private reporting toggle, and browser use are operational concerns                         |

Issues #42 and #45 are covered by explicit executable configuration and documentation; #45 also
works with a binary path from packages such as `ffmpeg-static`. Issue #48 remains unsupported by
design because this is a Node.js child-process package, not a browser/WASM implementation.

## Open pull requests

The 15 open PRs (#2, #7, #15, #36, #50, #53, #57, #58, #62, #69, #76, #82, #85, #87, #88) were
reviewed by intent. The rewrite supersedes the path quoting, executable path, buffer, bitrate, codec
copy, filename typo, and frame-quality changes. URI input is implemented. PNG/AWS input and silence
trimming remain use cases for the general argument API rather than dedicated presets. Each PR should
be closed with a link to the modernization release instead of merged onto the legacy code.

## Release status and ongoing verification

Version 1.0.0 was published on 2026-08-20 as the modernization boundary. Version 1.0.1 followed with
concurrency, buffering, validation, progress, frame extraction, watermark, CI, accessibility, and
supply-chain hardening identified during the post-release review. Version 1.0.2 adds owned
initialization cancellation, strict output/filter validation, trim-aware progress, isolated reusable
clients, and a single aggregate CI gate.

Version 1.0.3 makes terminal-method failures uniformly asynchronous, consumes immutable per-operation
builder snapshots, defines concurrent `Video` behavior, and binds trusted publishing to a verified
commit on protected `main`.

Version 1.1.0 adds immutable operation correlation to every lifecycle event, completes the public
watermark callback overloads, compile-checks terminal method declarations, and makes documentation
reveals resilient to full-page capture and printing.

Version 1.1.1 removes the remaining scroll-triggered compositing from documentation content, adds a
real Chromium full-page capture regression, and compiles a consumer against the assembled npm
tarball so package exports and declarations are verified together.

Version 1.1.2 upgrades that capture regression to versioned, platform-stable pixel baselines for
desktop and mobile, adds layout diagnostics without arbitrary delays, and preserves Playwright
reports, traces, screenshots, and diffs when protected CI or trusted publishing detects a visual
change.

Version 1.1.3 tightens visual comparisons to an absolute 500-pixel budget and explicitly denies
install scripts for every resolved `fsevents` version, keeping the visual and dependency policies
precise as the toolchain evolves.

The repository now validates Node 24 and 26 with real FFmpeg on Linux, macOS, and Windows, uses
private vulnerability reporting, required pull-request checks, immutable Action references, and npm
trusted publishing with provenance. Representative downstream media corpora and high-volume service
testing remain ongoing operational work rather than claims made by this package.
