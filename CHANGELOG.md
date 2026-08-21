# Changelog

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
