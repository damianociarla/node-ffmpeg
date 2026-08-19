# Changelog

## 1.0.0 - Unreleased

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
