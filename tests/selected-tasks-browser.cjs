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
    for (const width of [1440, 1366, 820, 390, 320]) {
      await page.setViewportSize({
        width,
        height: width === 1366 ? 685 : width > 650 ? 1080 : 844,
      });
      await page.evaluate(() => {
        document.querySelectorAll('dialog[open]').forEach((d) => d.close());
        eval(
          `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.projects=[{id:'entry-a',name:'مشروع به مهام'},{id:'entry-empty',name:'مشروع فارغ'}];state.taskInbox=[{id:'entry-task',name:'مهمة للاختيار',projectId:'entry-a'}];view='projects';selectedProject='';render()`,
        );
      });
      const toggle = page.locator('#toggleTaskSelection');
      assert.equal(
        await toggle.isVisible(),
        true,
        'selection control is discoverable before choosing a project',
      );
      assert.equal(await toggle.isDisabled(), true);
      if (width > 1050)
        await page
          .locator('#projectNavigation [data-project="entry-empty"]')
          .click();
      else await page.locator('#projectSelect').selectOption('entry-empty');
      assert.equal(await toggle.isDisabled(), true);
      if (width > 1050)
        await page
          .locator('#projectNavigation [data-project="entry-a"]')
          .click();
      else await page.locator('#projectSelect').selectOption('entry-a');
      assert.equal(
        await toggle.isEnabled(),
        true,
        'first project pick activates selection without a page reload',
      );
      assert.equal(await toggle.textContent(), 'تحديد عدة مهام');
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const compact = await page.evaluate(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        return {
          navigation: box('body > aside').height,
          toolbar: box('.project-list-toolbar').height,
          search: box('#projectSearch').height,
          add: box('#newProjectTask').height,
          progress: box('#projectGoalsTrack').height,
          countTop: box('#projectSearchResults').top,
          searchBottom: box('#projectSearch').bottom,
          stickyTop: getComputedStyle(
            document.querySelector('.project-list-toolbar'),
          ).top,
          backupTop: box('#downloadBackup').top,
          accountTop: box('#accountButton').top,
        };
      });
      if (width > 900) {
        assert.ok(compact.navigation <= 48, 'compact fixed navigation');
        assert.ok(
          compact.toolbar <= 42,
          'search, actions and count share one short row',
        );
        assert.ok(compact.search <= 32 && compact.add <= 32);
        assert.ok(
          compact.countTop < compact.searchBottom,
          'count has no separate row',
        );
        assert.equal(
          compact.stickyTop,
          '48px',
          'search sticks below navigation without a gap',
        );
      } else {
        assert.ok(
          compact.search >= 40 && compact.add >= 40,
          'phone touch targets remain usable',
        );
        assert.equal(
          compact.backupTop,
          compact.accountTop,
          'account and backup share one phone row',
        );
      }
      assert.equal(
        compact.progress,
        14,
        'no empty space reserved for absent goal markers',
      );
      console.log('PROJECT_TOOLBAR', width, JSON.stringify(compact));
      await shot('selection-button-' + width);
      await toggle.click();
      assert.equal(
        await page.locator('#projectTaskList [data-select-task]').count(),
        1,
      );
      await toggle.click();
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
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
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => {
        eval(
          `state.sunsetDays={};state.repeat=[];state.projects=[{id:'delete-a',name:'مشروع الحذف'},{id:'delete-b',name:'مشروع مشترك'}];state.taskInbox=Array.from({length:30},(_,i)=>({id:'delete-'+i,name:'مهمة '+i,projectIds:['delete-a','delete-b']}));state.taskInbox.push({id:'delete-child',name:'فرعية باقية',parentId:'delete-0',parentDate:'',parentName:'مهمة 0'});view='projects';selectedProject='delete-a';render();`,
        );
      });
      await page.locator('#toggleTaskSelection').click();
      const remove = page.locator('#deleteSelectedTasks');
      assert.equal(await remove.isDisabled(), true);
      await own(row('delete-0'), '[data-select-task]').check();
      await own(row('delete-1'), '[data-select-task]').check();
      await remove.scrollIntoViewIfNeeded();
      const position = await page.evaluate(() => scrollY);
      page.once('dialog', async (d) => {
        assert.match(d.message(), /حذف 2 مهمة/);
        await d.dismiss();
      });
      await remove.click();
      assert.equal(await page.evaluate(() => !!findTask('delete-0', '')), true);
      assert.equal(
        await page.locator('#selectedTaskCount').textContent(),
        '2 محددة',
      );
      await shot('bulk-delete-' + width);
      page.once('dialog', (d) => d.accept());
      await remove.click();
      assert.equal(
        await page.evaluate(
          () => !!findTask('delete-0', '') || !!findTask('delete-1', ''),
        ),
        false,
      );
      assert.equal(
        await page.evaluate(
          () => !!findTask('delete-child', '') && !!findTask('delete-2', ''),
        ),
        true,
      );
      assert.equal(await remove.isDisabled(), true);
      assert.ok(Math.abs((await page.evaluate(() => scrollY)) - position) < 2);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.reload();
      assert.equal(
        await page.evaluate(() => !!findTask('delete-0', '')),
        false,
      );
    }
    // The same deletion control works in the dashboard, including all remaining tasks.
    await page.evaluate(() => {
      eval(
        `state.taskInbox=[{id:'dashboard-delete',name:'حذف من اللوحة'}];view='dashboard';plannerTab='inbox';plannerProjectTabs.inbox='';render();`,
      );
    });
    await page.locator('#toggleTaskSelection').click();
    await page.locator('#selectVisibleTasks').click();
    page.once('dialog', (d) => d.accept());
    await page.locator('#deleteSelectedTasks').click();
    assert.equal(
      await page.evaluate(() => !!findTask('dashboard-delete', '')),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: desktop/phone selection, visible-only lazy children, unchanged row height, bulk priority and project add/replace, family inheritance, dashboard, saved results and reload',
    );
  } finally {
    await page.close();
  }
};
