import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation motion fallbacks', () => {
  it('keeps reveal content visible before intersection', async () => {
    const stylesheet = await readFile(resolve('docs/.vitepress/theme/styles.css'), 'utf8');
    expect(stylesheet).toMatch(/\.reveal-ready \.reveal\s*\{[^}]*opacity:\s*1;/s);
  });

  it('disables hidden and transformed content when printing', async () => {
    const stylesheet = await readFile(resolve('docs/.vitepress/theme/styles.css'), 'utf8');
    expect(stylesheet).toMatch(
      /@media print\s*\{[\s\S]*?\.reveal-ready \.reveal,[\s\S]*?opacity:\s*1 !important;[\s\S]*?transform:\s*none !important;/,
    );
  });

  it('keeps the header brand touch target at least 44 pixels high', async () => {
    const stylesheet = await readFile(resolve('docs/.vitepress/theme/styles.css'), 'utf8');
    expect(stylesheet).toMatch(/\.landing-brand\s*\{[^}]*min-height:\s*44px;/s);
  });
});
