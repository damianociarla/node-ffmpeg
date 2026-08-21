# Changelog

## 1.1.3 - 2026-08-21

### Testing and supply-chain hardening

- Replaced the one-percent visual tolerance with an absolute 500-pixel limit for full-page snapshots
- Explicitly disabled install scripts for Playwright's nested `fsevents@2.3.2` dependency
- Kept the existing `fsevents@2.3.3` denial so the install-script policy covers the complete dependency tree

## 1.1.2 - 2026-08-21

### Testing and release engineering

- Replaced the structural screenshot smoke test with versioned, platform-stable full-page visual baselines
- Added separate Chromium projects for a 1440x900 desktop and a 390x844 mobile viewport
- Removed the fixed visual-test delay in favor of deterministic reduced-motion, font, and network readiness
- Added section geometry and horizontal-overflow assertions alongside pixel comparisons
- Retained traces, screenshots, HTML reports, and image diffs as CI artifacts when visual checks fail

## 1.1.1 - 2026-08-21

### Fixed

- Removed scroll-triggered transforms from documentation sections so stitched full-page screenshots cannot duplicate or tear content
- Kept the hero entrance and interaction motion while making every content section compositionally stable

### Testing and release engineering

- Added a real Chromium full-page capture test with stable-style and landmark-content assertions
- Added a consumer TypeScript compilation test against the package produced by `npm pack`
- Required Chromium visual verification in pull-request, protected-main, and trusted-publish checks

## 1.1.0 - 2026-08-21

### Added

- Added immutable `MediaOperationContext` values with UUID, operation kind, and destination to every lifecycle event
- Added compile-only contract tests for every public terminal-method Promise and callback overload
- Added the missing watermark destination-plus-callback TypeScript overload

### Changed

- Made concurrent lifecycle event streams correlatable while preserving every historical first event argument
- Kept landing-page reveal content visible during full-page capture, archival, and visual-regression workflows
- Added print-safe motion overrides and enlarged the header brand target to 44px

## 1.0.3 - 2026-08-21

### Fixed

- Delivered save, MP3, frame, and watermark validation failures consistently through Promise rejection or asynchronous callbacks
- Consumed fluent builder state atomically at terminal-method invocation so failures cannot poison later operations
- Removed temporary frame-sizing mutations and isolated concurrent operations on the same `Video`
- Emitted optional error events for planning, filesystem, and process failures through one lifecycle
- Mapped frame-directory creation failures to stable error `106` with their original cause

### Security and release engineering

- Required release tags to resolve to commits reachable from `main`
- Required the exact tagged commit to have a successful GitHub Actions `CI / Required` check before installation or npm publishing
- Added a regression test that keeps release eligibility ahead of every untrusted package step

### Documentation and site

- Added complete method, return, lifecycle, concurrency, and numeric-error references
- Replaced the absolute “Typed end to end” claim with “Type-safe by default”
- Reduced mobile hero height, increased terminal text to 12px, enlarged CTA targets, and added `robots.txt`

## 1.0.2 - 2026-08-21

### Fixed

- Rejected output destinations beginning with `-` across conversion, MP3, frame, and watermark APIs
- Restricted padding colors to safe FFmpeg color forms before building filter graphs
- Validated the complete AbortSignal listener interface and made listener cleanup defensive
- Cancelled and awaited sibling probe/configuration processes while preserving the original failure
- Calculated progress from the effective trimmed duration and kept unknown percentages optional
- Corrected documentation for hierarchical URL inputs, unsupported stdin/streams, and trusted custom arguments
- Improved server-rendered 404 content and made landing-page reveals faster and progressive-enhancement safe

### Added

- Added isolated `createClient()` contexts that inspect capabilities once and reuse them across media inputs
- Added an aggregate `CI / Required` gate covering quality, unit, and real-FFmpeg matrices
- Expanded security, lifecycle, client isolation, progress, output-path, filter, CommonJS, and integration tests

## 1.0.1 - 2026-08-21

### Fixed

- Removed cross-request FFmpeg configuration caching that could mix environments, working directories, abort signals, and timeouts
- Applied identical input validation to `create()` and the callable factory
- Replaced repeated string concatenation with bounded byte collectors and preserved complete ffprobe JSON
- Reassembled stderr lines before progress parsing so split and batched updates are not lost
- Excluded stale matching files from frame extraction results
- Added strict runtime validation for timing, rates, quality, bitrate, channels, threads, frame selectors, and watermark margins
- Bound watermark filters to explicit input stream labels when additional inputs are present
- Preserved FFmpeg diagnostics on timeout and abort, and terminated descendant process trees

### Security and release engineering

- Added trusted npm publishing through GitHub Actions OIDC with automatic provenance
- Pinned every third-party GitHub Action to an immutable commit SHA
- Added Node 24 and 26 integration coverage across Linux, macOS, and Windows
- Added a branded favicon, social preview, canonical metadata, sitemap, accessible landing navigation, progressive reveal behavior, and a custom 404 page

## 1.0.0 - 2026-08-20

### Added

- First-party TypeScript declarations and strict TypeScript source
- ESM and backward-compatible callable CommonJS exports
- ffprobe JSON metadata with the raw response available to consumers
- Progress, start, stderr, end, and optional error events
- AbortSignal, exact timeout, overwrite, cwd, environment, and per-call executable settings
- Metadata, threads, video quality, command preview, repeated options, URLs, and codec copy support
- Unit, compatibility, security-regression, and real-FFmpeg integration tests
- CI across current supported Node.js releases

### Changed

- Replaced shell command strings with `spawn(command, args, { shell: false })`
- Replaced the unmaintained `when` dependency with native Promises
- Increased output retention from 200 KiB to 16 MiB without terminating long conversions
- Replaced text scraping of `ffmpeg -i` with structured ffprobe output
- Updated FFmpeg flags (`-c:v`, `-c:a`, `-b:v`, `-b:a`, `-frames:v`, `-fps_mode`)
- Corrected watermark compass coordinates and frame extraction results

### Removed

- Node.js versions older than 24
- The runtime dependency on `when`
- Shell interpolation and manual path quoting
