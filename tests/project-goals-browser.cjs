const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function projectGoalsBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (r) =>
    r.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  const screenshot = async (name) => {
    if (!process.env.WKT_SCREENSHOTS_DIR) return;
    fs.mkdirSync(process.env.WKT_SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.WKT_SCREENSHOTS_DIR, name + '.png'),
    });
  };
  try {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.projects=[{id:'browser-goals',name:'قراءة تفسير المصحف — أهداف الشهر'},{id:'browser-goals-b',name:'المشروع المشترك'}];state.taskInbox=[{id:'goals-root',name:'المهمة الأصلية',projectIds:['browser-goals','browser-goals-b']},{id:'goals-child',name:'المهمة الفرعية',parentId:'goals-root',parentDate:'',expectedSlots:10}];view='projects';selectedProject='browser-goals';render()`,
      );
    });
    await page.locator('#projectGoals').click();
    const editor = page.locator('#projectGoalsEditor'),
      form = page.locator('#projectGoalForm');
    for (const [date, percent] of [
      ['2050-11-01', '50'],
      ['2050-12-01', '100'],
    ]) {
      await form.locator('[name="goalDate"]').fill(date);
      await form.locator('[name="goalPercent"]').fill(percent);
      await form.locator('[data-save-goal]').click();
    }
    assert.equal(
      await page.locator('#projectGoalsList .project-goal-item').count(),
      2,
    );
    await page.keyboard.press('Escape');
    const marker = page.locator('.project-goal-marker').first(),
      line = marker.locator('span');
    const bar = await page.locator('.project-heading-progress').boundingBox(),
      tick = await line.boundingBox();
    assert.ok(
      Math.abs(tick.x + tick.width / 2 - (bar.x + bar.width / 2)) <= 1,
      '50% marker is centered on RTL progress',
    );
    assert.match(await marker.getAttribute('title'), /2050-11-01/);
    await page
      .locator(
        '#projectTaskList > .task-row > .task-row-heading [data-task-toggle]',
      )
      .click();
    await page.evaluate(() => {
      window.goalsChildNode = document.querySelector(
        '#projectTaskList [data-task-id="goals-child"]',
      );
    });
    const child = page.locator('#projectTaskList [data-task-id="goals-child"]');
    await child.locator('[data-progress]').fill('5');
    await child.locator('[data-progress]').press('Enter');
    assert.equal(
      await marker.evaluate((e) => e.classList.contains('reached')),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.goalsChildNode ===
          document.querySelector(
            '#projectTaskList [data-task-id="goals-child"]',
          ),
      ),
      true,
    );
    await marker.click();
    assert.equal(await form.locator('[name="goalPercent"]').inputValue(), '50');
    await form.locator('[name="goalPercent"]').fill('60');
    await form.locator('[data-save-goal]').click();
    await page.keyboard.press('Escape');
    assert.equal(
      await marker.evaluate((e) => e.classList.contains('reached')),
      false,
    );
    await child.locator('[data-outcome="done"]').click();
    assert.equal(await page.locator('.project-goal-marker.reached').count(), 2);
    await child.locator('[data-outcome="done"]').click();
    await screenshot('goals-desktop');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const bounds = await marker.boundingBox();
      assert.ok(bounds.width >= 40 && bounds.height >= 40);
      await marker.click();
      const dialog = await editor.boundingBox();
      assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width);
      assert.equal(
        await editor.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        true,
      );
      await screenshot('goals-editor-' + width);
      await editor.locator('[data-delete-goal]').first().click();
      assert.equal(
        await page.locator('#projectGoalsList .project-goal-item').count(),
        1,
      );
      await form.locator('[name="goalDate"]').fill('2050-11-01');
      await form.locator('[name="goalPercent"]').fill('60');
      await form.locator('[data-save-goal]').click();
      await page.keyboard.press('Escape');
      await screenshot('goals-phone-' + width);
    }
    await page.reload();
    await page.evaluate(() => {
      view = 'projects';
      selectedProject = 'browser-goals';
      render();
    });
    assert.equal(
      await page.locator('.project-goal-marker').count(),
      2,
      'saved goals survive reload',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: project goal creation/edit/delete, exact RTL placement, live nested/shared progress, stable rows, keyboard, reload and 320/390px touch/overflow',
    );
  } finally {
    await page.close();
  }
};
