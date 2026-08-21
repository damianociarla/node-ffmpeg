# Security policy

## Supported versions

Security fixes are provided for the latest major release. Version `0.0.4` is legacy and should not
be used for new deployments because it constructs shell commands from application input.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting for this repository. Do not open a public issue
containing exploit details.

Include the affected version, platform, FFmpeg version, reproduction steps, and the security impact.

## Operational guidance

- Keep both Node.js and the installed FFmpeg build patched.
- Treat all media, paths, URLs, filters, and custom command arguments as untrusted input.
- Use `timeout`, `AbortSignal`, container limits, and OS-level CPU/memory limits for public services.
- Restrict network protocols in the FFmpeg build or deployment when remote inputs are unnecessary.
- Avoid passing secrets through arguments because process command lines may be observable locally.
- Keep untrusted values out of `addInput`, `addCommand`, `addOutputOption`, and `addFilterComplex`;
  these low-level escape hatches intentionally expose raw FFmpeg argument semantics.
- Output destinations beginning with `-` are rejected. Prefix intentional relative filenames with
  `./` so FFmpeg cannot reinterpret them as options.
