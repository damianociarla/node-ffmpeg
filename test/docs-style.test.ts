import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation motion fallbacks', () => {
  it('keeps section content outside scroll-triggered compositing', async () => {
    const stylesheet = await readFile(resolve('docs/.vitepress/theme/styles.css'), 'utf8');
    expect(stylesheet).toMatch(/\.reveal\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;/s);
    expect(stylesheet).not.toContain('.reveal-ready');
    expect(stylesheet).not.toContain('.reveal.is-visible');
  });

  it('disables hidden and transformed content when printing', async () => {
    const stylesheet = await readFile(resolve('docs/.vitepress/theme/styles.css'), 'utf8');
    expect(stylesheet).toMatch(
      /@media print\s*\{[\s\S]*?\.reveal,[\s\S]*?opacity:\s*1 !important;[\s\S]*?transform:\s*none !important;/,
    );
  });

  it('keeps the header brand touch target at least 44 pixels high', async () => {
    const stylesheet = await readFile(resolve('docs/.vitepress/theme/styles.css'), 'utf8');
    expect(stylesheet).toMatch(/\.landing-brand\s*\{[^}]*min-height:\s*44px;/s);
  });
});
