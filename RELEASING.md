# Releasing

Releases are published by `.github/workflows/release.yml` through npm trusted publishing. The workflow
uses GitHub OIDC, does not read a long-lived npm token, and generates npm provenance automatically.

1. Update `package.json`, `package-lock.json`, and `CHANGELOG.md` in a pull request.
2. Merge only after every CI matrix job passes.
3. Create the matching annotated tag (`vX.Y.Z`) from the merge commit.
4. Publish a GitHub Release for that tag. The release workflow verifies the tag/package version, runs
   the complete project check, and publishes to npm.

Before any package installation, the release workflow also proves that the tagged commit is
reachable from `origin/main` and that the exact SHA completed the protected `CI / Required` GitHub
Actions check successfully. A tag from an unmerged or unverified commit fails closed.

The npm trusted publisher must remain restricted to:

- repository: `damianociarla/node-ffmpeg`
- workflow: `release.yml`
- environment: `npm`
- allowed action: `npm publish`

Do not add an npm write token to the repository or GitHub Actions secrets.
