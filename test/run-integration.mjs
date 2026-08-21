import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestPath = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const result = spawnSync(process.execPath, [vitestPath, 'run', 'test/real-ffmpeg.test.ts'], {
  env: { ...process.env, FFMPEG_INTEGRATION: '1' },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
