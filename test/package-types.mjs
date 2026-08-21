import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'node-ffmpeg-package-types-'));
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  const packOutput = execFileSync(
    npmExecutable,
    ['pack', '--json', '--pack-destination', fixtureRoot],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = join(fixtureRoot, filename);

  await writeFile(
    join(fixtureRoot, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  execFileSync(
    npmExecutable,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--engine-strict=false',
      tarball,
    ],
    { cwd: fixtureRoot, stdio: 'pipe' },
  );

  await writeFile(
    join(fixtureRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        lib: ['ES2024'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
        target: 'ES2024',
        typeRoots: [resolve(repositoryRoot, 'node_modules/@types')],
        types: ['node'],
      },
      files: ['consumer.ts'],
    }),
  );
  await writeFile(
    join(fixtureRoot, 'consumer.ts'),
    `import ffmpeg, { createClient, type LegacyCallback, type MediaOperationContext } from 'ffmpeg';

const callback: LegacyCallback<string> = (error, output) => {
  void error;
  void output;
};

async function consume(input: string): Promise<void> {
  const video = await ffmpeg(input);
  const output: Promise<string> = video.save('output.mp4');
  video.fnAddWatermark('logo.png', 'watermarked.mp4', callback);
  video.on('progress', (progress, operation: MediaOperationContext) => {
    void progress.percent;
    void operation.operationId;
    void operation.destination;
  });
  const client = await createClient();
  await client.open(input);
  await output;
}

void consume;
`,
  );

  execFileSync(
    process.execPath,
    [resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'],
    { cwd: fixtureRoot, stdio: 'inherit' },
  );
} finally {
  await rm(fixtureRoot, { force: true, recursive: true });
}
