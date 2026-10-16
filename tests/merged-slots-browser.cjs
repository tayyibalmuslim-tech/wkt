const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function mergedSlotsBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (r) =>
    r.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  const shot = async (name) => {
    if (process.env.WKT_SCREENSHOTS_DIR) {
      fs.mkdirSync(process.env.WKT_SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.WKT_SCREENSHOTS_DIR, name + '.png'),
      });
    }
  };
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];date='2026-10-16';view='day';prayer=2;const s=range(prayer)[0];window.mergeStart=s;SlotTools.apply(day(),s,s+6,'actual',state.actions[0].id,'ملاحظة واحدة للفترة كلها',starts()[3]);SlotTools.apply(day(),s,s+3,'planned',state.actions[1].id,'خطة أولى',starts()[3]);SlotTools.apply(day(),s+3,s+6,'planned',state.actions[2].id,'خطة ثانية',starts()[3]);save();render();window.mergeShell=document.querySelector('.day-workspace')`,
      );
    });
    const start = await page.evaluate(() => window.mergeStart);
    const merged = () =>
      page.locator(`.slot-actual[data-range-start="${start}"]`);
    const box = await merged().first().boundingBox();
    const single = await page
      .locator(`.slot-actual[data-slot="${start + 6}"]`)
      .boundingBox();
    assert.ok(
      Math.abs(box.width - (single.width * 6 + 8 * 5)) < 2,
      'one hour keeps six slot widths, not one',
    );
    assert.equal(await page.locator('.slot-actual .slot-note').count(), 1);
    assert.equal(
      await page.locator('.slot-planned .slot-note').count(),
      2,
      'independent plans do not split the actual hour',
    );
    await page
      .locator('#dailySlots')
      .evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await shot('merged-slots-desktop');
    await merged().first().click();
    assert.equal(+(await page.locator('#slotTo').inputValue()) - start, 6);
    await page.locator('#singleSlotOnly').click();
    await page.locator('#slotNote').fill('خانة منفصلة');
    await page.locator('#slotForm button.primary').click();
    assert.equal(
      await page.evaluate(() => day().actualNotes[window.mergeStart % 144]),
      'خانة منفصلة',
    );
    assert.equal(
      await page.evaluate(
        () => day().actualNotes[(window.mergeStart + 1) % 144],
      ),
      'ملاحظة واحدة للفترة كلها',
    );
    assert.equal(
      await page.evaluate(
        () => window.mergeShell === document.querySelector('.day-workspace'),
      ),
      true,
    );
    const snapshot = await page.evaluate(() => JSON.stringify(state));
    for (const width of [820, 390, 320]) {
      await page.setViewportSize({ width, height: width > 650 ? 1180 : 844 });
      await page.waitForFunction(() => {
        const g = document.querySelector('#dailySlots');
        return (
          +g.dataset.columns ===
          Math.max(2, Math.floor((g.clientWidth + 8) / 168))
        );
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const geometry = await page.locator('#dailySlots').evaluate((g) => {
        const c = +g.dataset.columns,
          w = (g.clientWidth - 8 * (c - 1)) / c;
        return [...g.children].map((e) => ({
          actual: e.getBoundingClientRect().width,
          expected:
            w *
              (+e.querySelector('button').dataset.pieceEnd -
                +e.querySelector('button').dataset.slot) +
            8 *
              (+e.querySelector('button').dataset.pieceEnd -
                +e.querySelector('button').dataset.slot -
                1),
          height: e.querySelector('button').getBoundingClientRect().height,
        }));
      });
      assert.ok(
        geometry.every(
          (r) => Math.abs(r.actual - r.expected) < 2 && r.height >= 40,
        ),
      );
      assert.equal(
        await page.evaluate(() => JSON.stringify(state)),
        snapshot,
        'responsive wrapping does not modify slots',
      );
      assert.equal(
        await page.locator('.slot-actual .slot-note').count(),
        2,
        'notes are not repeated on continuation pieces',
      );
      await page
        .locator('#dailySlots')
        .evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await shot('merged-slots-' + width);
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.evaluate(() => {
      eval(
        `state.projects=[];state.taskInbox=[];delete state.tafsirDefaultInstalled;installDefaultTafsir(state);state.projects.push(...Array.from({length:45},(_,i)=>({id:'index-'+i,name:'مشروع '+i})));view='projects';selectedProject=TAFSIR_PROJECT_ID;render();window.scrollTo(0,600)`,
      );
    });
    const panel = page.locator('#projectDetails');
    assert.equal(
      await panel.evaluate((e) => getComputedStyle(e).overflowY),
      'visible',
    );
    assert.ok(
      (await panel.boundingBox()).height > 1000,
      'project uses document height',
    );
    const scroll = await page.evaluate(() => scrollY);
    assert.ok(scroll > 300);
    await page
      .locator('#projectNavigation')
      .evaluate((e) => (e.scrollTop = 260));
    assert.equal(
      await page.evaluate(() => scrollY),
      scroll,
      'project-index scrolling is independent',
    );
    assert.ok(
      (await page.locator('#projectNavigation').evaluate((e) => e.scrollTop)) >
        0,
    );
    await page.evaluate(() => selectProject('index-0'));
    await page.evaluate(() => selectProject(TAFSIR_PROJECT_ID));
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - scroll) < 2,
      'document position restored per project',
    );
    await page.evaluate(() =>
      document.querySelector('#projectTaskList [data-outcome="done"]').click(),
    );
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - scroll) < 2,
      'outcome keeps document position',
    );
    await page.evaluate(() =>
      document.querySelector('#projectTaskList [data-task-edit]').click(),
    );
    await page
      .locator('#plannerForm [name="taskDescription"]')
      .fill('وصف معدل');
    await page.locator('#plannerForm button.primary').click();
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - scroll) < 2,
      'editor return keeps document position',
    );
    await shot('project-document-scroll');
    assert.deepEqual(errors, []);
    console.log(
      'PASS: six-slot proportional width, independent plans, single edit, responsive continuation without data/note duplication, document-owned project scrolling and sticky independent index/context',
    );
  } finally {
    await page.close();
  }
};
