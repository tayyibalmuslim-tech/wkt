/* Real daily/mobile geometry and recording checks; requires optional Chromium. */
const assert = require('node:assert/strict');
module.exports = async function dayBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  const assertCentred = async () => {
    const bounds = await page.locator('#picker').boundingBox(),
      viewport = page.viewportSize();
    assert.ok(
      Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) <= 1,
      'slot recorder is horizontally centred',
    );
    assert.ok(
      Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) <= 1,
      'slot recorder is vertically centred',
    );
  };
  try {
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];view='day';prayer=3;render();`,
      );
    });
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 820, height: 1180 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        'daily page fits viewport',
      );
      const slot = page.locator('#dailySlots .slot').first();
      for (const selector of ['.slot-actual', '.slot-planned']) {
        const box = await slot.locator(selector).boundingBox();
        assert.ok(
          box.width >= 40 && box.height >= 40,
          'both recording targets are accessible',
        );
      }
      await slot.locator('.slot-actual').click();
      const picker = await page.locator('#picker').boundingBox();
      assert.ok(
        picker.x >= 0 &&
          picker.y >= 0 &&
          picker.x + picker.width <= viewport.width &&
          picker.y + picker.height <= viewport.height,
      );
      await assertCentred();
      await page.locator('#slotNote').fill('ملاحظة تجربة');
      await page.locator('#picker [data-action-choice]').first().click();
      assert.equal(
        await page.locator('#picker').evaluate((e) => e.open),
        false,
      );
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.matches('[data-kind="actual"]'),
        ),
        true,
      );
      await slot.locator('.slot-planned').click();
      await assertCentred();
      await page.keyboard.press('Escape');
      await page.locator('#bulkSlots').click();
      await assertCentred();
      await page.keyboard.press('Escape');
      if (viewport.width < 650) {
        const nav = page.locator('.mobile-navigation');
        assert.equal(await nav.isVisible(), true);
        const box = await nav.boundingBox();
        assert.ok(box.y + box.height >= viewport.height - 1);
        await nav.locator('summary').click();
        await nav.locator('[data-view="repeat"]').click();
        assert.equal(
          await nav
            .locator('[data-view="repeat"]')
            .getAttribute('aria-current'),
          'page',
        );
        assert.equal(
          await page.locator('#navigationMore').evaluate((e) => e.open),
          false,
        );
        await nav.locator('[data-view="day"]').click();
      }
      await page.evaluate(() => scrollTo(0, 0));
      assert.equal(await page.locator('#downloadBackup').isVisible(), true);
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
};
