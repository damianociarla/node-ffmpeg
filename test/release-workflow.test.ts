import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release workflow policy', () => {
  it('verifies main ancestry and the protected CI gate before installing or publishing', async () => {
    const workflow = await readFile(resolve('.github/workflows/release.yml'), 'utf8');
    const eligibility = workflow.indexOf('Verify protected-main release eligibility');
    const install = workflow.indexOf('npm ci');
    const publish = workflow.indexOf('npm publish --access public');

    expect(eligibility).toBeGreaterThan(0);
    expect(eligibility).toBeLessThan(install);
    expect(install).toBeLessThan(publish);
    expect(workflow).toContain('git merge-base --is-ancestor "$release_sha" origin/main');
    expect(workflow).toContain('check-runs?filter=latest&per_page=100');
    expect(workflow).toContain("check.app?.slug === 'github-actions'");
    expect(workflow).toContain('REQUIRED_CHECK: CI / Required');
    expect(workflow).toContain('checks: read');
  });
});
