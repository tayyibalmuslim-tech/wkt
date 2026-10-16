const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function selectedTasksBrowser(browser, url) {
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
  const row = (id) =>
    page.locator('#projectTaskList [data-task-id="' + id + '"]');
  const own = (r, s) => r.locator(':scope > .task-row-heading ' + s);
  try {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.projects=[{id:'a',name:'مشروع أ'},{id:'b',name:'مشروع ب'},{id:'c',name:'مشروع ج'}];state.taskInbox=[{id:'root',name:'مهمة مشتركة',projectIds:['a','b'],priority:3},{id:'child',name:'مهمة فرعية',parentId:'root',parentDate:'',priority:3,expectedSlots:10,completedSlotCount:4},{id:'free',name:'مهمة مستقلة',projectId:'a',priority:4,expectedSlots:2}];view='projects';selectedProject='a';render()`,
      );
    });
    const height = await own(row('root'), '.task-row-select').evaluate(
      (e) => e.parentElement.getBoundingClientRect().height,
    );
    assert.equal(await page.locator('[data-select-task]').count(), 0);
    await page.locator('#toggleTaskSelection').click();
    assert.equal(
      await page.locator('[data-select-task]').count(),
      2,
      'closed children are not rendered for selection',
    );
    assert.equal(
      await own(row('root'), '.task-row-select').evaluate(
        (e) => e.parentElement.getBoundingClientRect().height,
      ),
      height,
    );
    await page.locator('#selectVisibleTasks').click();
    assert.equal(
      await page.locator('#selectedTaskCount').textContent(),
      '2 محددة',
    );
    await page.locator('#clearSelectedTasks').click();
    await own(row('root'), '[data-task-toggle]').click();
    await own(row('child'), '[data-select-task]').check();
    await own(row('free'), '[data-select-task]').check();
    await own(row('root'), '[data-task-toggle]').click();
    await own(row('root'), '[data-task-toggle]').click();
    assert.equal(
      await own(row('child'), '[data-select-task]').isChecked(),
      true,
    );
    await page.locator('#editSelectedTasks').click();
    const editor = page.locator('#selectedTasksEditor');
    await editor.locator('[data-edit-selected="priority"]').check();
    await editor.locator('[name="priority"][value="2"]').check();
    await editor.locator('[data-edit-selected="projects"]').check();
    await editor.locator('[name="projectIds"][value="c"]').check();
    await shot('bulk-desktop-editor');
    await editor.locator('button.primary').click();
    assert.equal(await editor.isVisible(), false);
    assert.equal(await own(row('child'), '[data-progress]').inputValue(), '4');
    assert.equal(await page.evaluate(() => findTask('root', '').priority), 3);
    assert.equal(await page.evaluate(() => findTask('child', '').priority), 2);
    assert.deepEqual(
      await page.evaluate(() => taskProjectIds(findTask('root', ''))),
      ['a', 'b', 'c'],
    );
    assert.equal(await page.locator('[data-select-task]').count(), 0);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('#toggleTaskSelection').click();
      await own(row('child'), '[data-select-task]').check();
      const label = own(row('child'), '.task-bulk-check');
      await label.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      const bounds = await label.boundingBox();
      assert.ok(bounds.width >= 40 && bounds.height >= 40);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await shot('bulk-selection-' + width);
      await page.locator('#editSelectedTasks').click();
      await editor.locator('[data-edit-selected="projects"]').check();
      await editor.locator('[name="projectMode"]').selectOption('add');
      await editor.locator('[name="projectIds"][value="c"]').check();
      const box = await editor.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      await shot('bulk-editor-' + width);
      await editor.locator('button.primary').click();
    }
    await page.evaluate(() => {
      view = 'dashboard';
      plannerTab = 'inbox';
      plannerProjectTabs.inbox = 'c';
      render();
    });
    await page.locator('#toggleTaskSelection').click();
    await page.locator('#selectVisibleTasks').click();
    assert.equal(
      await page.locator('#selectedTaskCount').textContent(),
      '3 محددة',
    );
    await page.locator('#editSelectedTasks').click();
    await editor.locator('[data-edit-selected="projects"]').check();
    await editor.locator('[name="projectMode"]').selectOption('replace');
    await editor.locator('[name="projectIds"][value="b"]').check();
    await editor.locator('button.primary').click();
    assert.deepEqual(
      await page.evaluate(() => taskProjectIds(findTask('root', ''))),
      ['b'],
    );
    assert.deepEqual(
      await page.evaluate(() => taskProjectIds(findTask('free', ''))),
      ['b'],
    );
    assert.equal(
      await page.evaluate(() => findTask('free', '').priority),
      2,
      'unchecked priority stays unchanged',
    );
    await page.reload();
    assert.deepEqual(
      await page.evaluate(() => taskProjectIds(findTask('free', ''))),
      ['b'],
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: desktop/phone selection, visible-only lazy children, unchanged row height, bulk priority and project add/replace, family inheritance, dashboard, saved results and reload',
    );
  } finally {
    await page.close();
  }
};
