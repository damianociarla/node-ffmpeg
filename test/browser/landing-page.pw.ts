import { expect, test } from '@playwright/test';

test('full-page capture keeps every section in a stable compositing state', async ({
  page,
}, testInfo) => {
  await page.goto('./');
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

  await page.waitForTimeout(1_000);
  const capturePath = testInfo.outputPath('landing-full-page.png');
  const capture = await page.screenshot({ fullPage: true, path: capturePath });
  expect(capture.subarray(1, 4).toString()).toBe('PNG');
  expect(capture.byteLength).toBeGreaterThan(100_000);
  await testInfo.attach('landing-full-page', { contentType: 'image/png', path: capturePath });

  await expectStableRevealStyles();
  await expect(page.locator('.manifesto-copy')).toContainText('Your media stays under control.');
  await expect(page.locator('.pipeline-section')).toContainText('One fluent pipeline');
  await expect(page.locator('.proof-section')).toContainText('runtime dependencies');
  await expect(page.locator('.compat-section')).toContainText('Old code keeps moving.');
  await expect(page.locator('.final-section')).toContainText('Build the pipeline.');
});
