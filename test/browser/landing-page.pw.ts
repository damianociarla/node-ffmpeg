import { expect, test } from '@playwright/test';

const sectionSelectors = [
  '.hero-section',
  '.manifesto-section',
  '.pipeline-section',
  '.proof-section',
  '.compat-section',
  '.final-section',
] as const;

test('landing page matches its full-page visual baseline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./', { waitUntil: 'networkidle' });
  await page.waitForFunction('document.fonts.status === "loaded"');
  await expect(page).toHaveTitle(/node-ffmpeg/);

  const revealElements = page.locator('.reveal');
  await expect(revealElements).toHaveCount(11);

  const expectStableRevealStyles = async () => {
    for (let index = 0; index < 11; index += 1) {
      await expect(revealElements.nth(index)).toHaveCSS('opacity', '1');
      await expect(revealElements.nth(index)).toHaveCSS('transform', 'none');
    }
  };

  await expectStableRevealStyles();

  const sectionBoxes = [];
  for (const selector of sectionSelectors) {
    const section = page.locator(selector);
    await expect(section).toHaveCount(1);
    const box = await section.boundingBox();
    if (!box) {
      throw new Error(`${selector} must be visible`);
    }
    expect(box.width, `${selector} must have width`).toBeGreaterThan(0);
    expect(box.height, `${selector} must have height`).toBeGreaterThan(0);
    sectionBoxes.push(box);
  }

  for (const [index, currentBox] of sectionBoxes.entries()) {
    if (index === 0) continue;
    const previousBox = sectionBoxes[index - 1];
    if (!previousBox) throw new Error('Every section after the first must have a predecessor');
    const previousBottom = previousBox.y + previousBox.height;
    expect(currentBox.y).toBeGreaterThanOrEqual(previousBottom - 1);
  }

  const hasHorizontalOverflow = await page.evaluate<boolean>(
    'document.documentElement.scrollWidth > document.documentElement.clientWidth',
  );
  expect(hasHorizontalOverflow).toBe(false);

  await expect(page).toHaveScreenshot('landing-full-page.png', {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: 0.01,
    scale: 'css',
  });

  await expectStableRevealStyles();
  await expect(page.locator('.manifesto-copy')).toContainText('Your media stays under control.');
  await expect(page.locator('.pipeline-section')).toContainText('One fluent pipeline');
  await expect(page.locator('.proof-section')).toContainText('runtime dependencies');
  await expect(page.locator('.compat-section')).toContainText('Old code keeps moving.');
  await expect(page.locator('.final-section')).toContainText('Build the pipeline.');
});
