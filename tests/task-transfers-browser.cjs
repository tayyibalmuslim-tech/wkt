const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function taskTransfersBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (r) =>
    r.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url);
      await page.evaluate(() => {
        state.starterIntroPending = false;
        state.sunsetDays = {};
        state.repeat = [];
        state.taskInbox = [];
        state.projects = [];
        document.querySelectorAll('dialog[open]').forEach((d) => d.close());
        date = activeDay();
        view = 'day';
        prayer = 0;
        savePlannedTask(null, {
          id: 'browser-transfer',
          name: 'حفظ صفحتين',
          date,
          prayer: 0,
          priority: 2,
          expectedSlots: 6,
        });
        recordTaskProgress(findTask('browser-transfer', date), 2);
        save();
        render();
      });
      const heading = page.locator('#dailyTaskCards .task-row-heading');
      const before = await heading.evaluate(
        (e) => e.getBoundingClientRect().height,
      );
      await page.locator('#dailyTaskCards [data-outcome="failed"]').click();
      assert.equal(
        await page.evaluate(() => outcome(findTask('browser-transfer', date))),
        'pending',
      );
      await page.locator('[data-transfer-option]').click();
      await page.locator('[data-transfer-tomorrow]').click();
      await page.locator('[name=transferPrayer]').selectOption('2');
      const fits = await page.locator('#taskTransfer').evaluate((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          e.scrollWidth <= e.clientWidth + 1
        );
      });
      assert.equal(fits, true, 'transfer dialog fits viewport');
      if (process.env.WKT_SCREENSHOTS_DIR) {
        fs.mkdirSync(process.env.WKT_SCREENSHOTS_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(
            process.env.WKT_SCREENSHOTS_DIR,
            `transfer-dialog-${width}.png`,
          ),
        });
      }
      await page.locator('[data-transfer-form] button[type=submit]').click();
      assert.equal(
        await page.locator('#dailyTaskCards .task-historical').count(),
        1,
      );
      assert.equal(
        await page
          .locator(
            '#dailyTaskCards [data-outcome], #dailyTaskCards [data-progress]',
          )
          .count(),
        0,
      );
      await page.locator('#dailyTaskCards [data-task-history]').click();
      assert.match(await page.locator('#taskHistory').innerText(), /لم تُنجز/);
      await page.locator('[data-current-task]').click();
      assert.equal(
        await page.locator('#plannerForm [name=completedSlots]').inputValue(),
        '2',
      );
      await page.locator('#closePlanner').click();
      await page.evaluate(() => {
        date = addDate(activeDay(), 1);
        prayer = 2;
        render();
      });
      assert.equal(
        await page.locator('#dailyTaskCards .task-row-primary button').count(),
        3,
      );
      assert.equal(
        await page.locator('#dailyTaskCards [data-progress]').inputValue(),
        '2',
      );
      const after = await heading.evaluate(
        (e) => e.getBoundingClientRect().height,
      );
      assert.ok(
        after <= before + 2,
        `deferred row stays compact at ${width}: ${before} -> ${after}`,
      );
      if (process.env.WKT_SCREENSHOTS_DIR)
        await page.screenshot({
          path: path.join(
            process.env.WKT_SCREENSHOTS_DIR,
            `transfer-active-${width}.png`,
          ),
        });
      await page.locator('#dailyTaskCards [data-task-edit]').click();
      await page.locator('[data-undo-transfer]').click();
      await page.locator('#closePlanner').click();
      assert.equal(
        await page.evaluate(
          () => findTask('browser-transfer', activeDay()).historical,
        ),
        undefined,
      );
      assert.equal(
        await page.evaluate(() =>
          completedSlots(findTask('browser-transfer', activeDay())),
        ),
        2,
      );
      assert.equal(
        await page.evaluate(() =>
          findTask('browser-transfer', addDate(activeDay(), 1)),
        ),
        undefined,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: transfer choice/date/prayer, historical read-only cards, full history, undo and unchanged row height at desktop/phone widths',
    );
  } finally {
    await page.close();
  }
};
