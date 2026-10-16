const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function inlineControlsBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (r) =>
    r.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  const save = async (name) => {
    if (process.env.WKT_SCREENSHOTS_DIR) {
      fs.mkdirSync(process.env.WKT_SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.WKT_SCREENSHOTS_DIR, name + '.png'),
      });
    }
  };
  const own = (row, selector) =>
    row.locator(':scope > .task-row-heading ' + selector);
  const geometry = async (row) =>
    row
      .locator(':scope > .task-row-heading')
      .evaluate((e) => e.getBoundingClientRect().toJSON());
  const assertControls = async (row, width) => {
    const data = await row
      .locator(':scope > .task-row-heading')
      .evaluate((heading) => {
        const rect = heading.getBoundingClientRect();
        return [
          ...heading.querySelectorAll(
            '[data-outcome], [data-task-edit], [data-progress], [data-project-order-key], [data-subtask-order]',
          ),
        ].map((e) => {
          const r = e.getBoundingClientRect(),
            hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
          return {
            visible: r.width > 0 && r.height > 0,
            height: r.height,
            width: r.width,
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            headingTop: rect.top,
            headingBottom: rect.bottom,
            hit: hit === e || e.contains(hit),
            kind: e.tagName,
          };
        });
      });
    assert.equal(
      data.length,
      5,
      'three direct buttons and two numeric controls',
    );
    for (const r of data) {
      assert.ok(r.visible);
      assert.ok(
        r.top >= r.headingTop && r.bottom <= r.headingBottom,
        'all essential controls stay inside their row',
      );
      assert.ok(
        r.left >= 0 && r.right <= width,
        'no controls clipped outside the phone',
      );
      if (width <= 650) assert.ok(r.width >= 40 && r.height >= 40);
      assert.ok(
        r.hit,
        'control is not covered: ' + width + ' ' + JSON.stringify(r),
      );
    }
  };
  try {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];delete state.tafsirDefaultInstalled;installDefaultTafsir(state);hideCompletedWork=false;view='projects';selectedProject=TAFSIR_PROJECT_ID;expandedTaskRows.clear();projectViews.clear();render();window.inlinePageRenders=0;const inlineRealRender=render;render=(...a)=>{window.inlinePageRenders++;return inlineRealRender(...a)};`,
      );
    });
    const rows = page.locator('#projectTaskList > .task-row'),
      first = rows.first(),
      panel = page.locator('#projectDetails');
    assert.equal(await rows.count(), 30);
    assert.equal(
      await page.locator('#projectTaskList .task-children .task-row').count(),
      0,
    );
    await assertControls(first, 1440);
    const before = await geometry(first);
    assert.ok(before.height >= 40 && before.height <= 48);
    await own(first, '[data-outcome="done"]').click();
    assert.equal((await geometry(first)).height, before.height);
    assert.equal(await page.evaluate(() => window.inlinePageRenders), 0);
    await own(first, '[data-outcome="done"]').click();
    await own(first, '[data-task-toggle]').click();
    const child = first.locator(':scope > .task-children > .task-row').first();
    await assertControls(child, 1440);
    assert.ok((await geometry(child)).height < before.height);
    const input = own(child, '[data-progress]');
    await input.fill('2');
    await input.evaluate((e) => (window.inlineSavedInput = e));
    await input.press('Enter');
    assert.equal(
      await input.evaluate(
        (e) => e === document.activeElement && e === window.inlineSavedInput,
      ),
      true,
    );
    assert.equal(await input.inputValue(), '2');
    await save('inline-desktop-tafsir');
    // Twenty siblings, a deep family and a task shared by two projects.
    await page.evaluate(() =>
      eval(
        `state.sunsetDays={};state.repeat=[];state.projects=[{id:'inline-big',name:'مشروع المتابعة'},{id:'inline-shared',name:'مشروع مشترك'}];state.taskInbox=[{id:'inline-parent',name:'مهمة رئيسية بعشرين فرعًا',description:'كل الأدوات مباشرة في الصف',projectIds:['inline-big','inline-shared']},...Array.from({length:20},(_,i)=>({id:'inline-leaf-'+i,name:'المهمة الفرعية '+i,description:'وصف قصير',parentId:'inline-parent',parentDate:'',expectedSlots:2})),{id:'inline-deep',name:'مستوى عميق',parentId:'inline-leaf-4',parentDate:'',expectedSlots:2}];selectedProject='inline-big';expandedTaskRows.clear();projectViews.clear();render();window.inlinePageRenders=0;`,
      ),
    );
    const root = page.locator(
      '#projectTaskList [data-task-id="inline-parent"]',
    );
    await own(root, '[data-task-toggle]').click();
    assert.equal(
      await root.locator(':scope > .task-children > .task-row').count(),
      20,
    );
    const heights = await root
      .locator(':scope > .task-children > .task-row > .task-row-heading')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
    assert.ok(
      heights.every((h) => h <= 40),
      'twenty dense sibling rows',
    );
    await save('inline-desktop-twenty');
    const nested = page.locator(
      '#projectTaskList [data-task-id="inline-leaf-4"]',
    );
    await own(nested, '[data-task-toggle]').click();
    const rank = own(nested, '[data-subtask-order]');
    await rank.fill('1');
    const top = await panel.evaluate((e) => e.scrollTop);
    await rank.press('Enter');
    assert.equal(await panel.evaluate((e) => e.scrollTop), top);
    assert.equal(
      await rank.evaluate((e) => e === document.activeElement),
      true,
    );
    assert.equal(
      await page
        .locator('#projectTaskList [data-task-id="inline-deep"]')
        .count(),
      1,
    );
    await own(nested, '[data-task-edit]').click();
    assert.equal(
      await page.locator('#plannerForm [name="taskName"]').inputValue(),
      'المهمة الفرعية 4',
    );
    await page.locator('#plannerForm [name="taskName"]').fill('اسم معدل');
    await page.locator('#plannerForm .primary').click();
    assert.equal(
      await page.locator('#plannerEditor').evaluate((e) => e.open),
      false,
    );
    assert.equal(
      await page
        .locator('#projectTaskList [data-task-id="inline-deep"]')
        .count(),
      1,
    );
    assert.equal(await panel.evaluate((e) => e.scrollTop), top);
    for (const width of [820, 390, 320]) {
      await page.setViewportSize({ width, height: width > 650 ? 1180 : 844 });
      await panel.evaluate((e) => (e.scrollTop = 0));
      await page.evaluate(() => scrollTo(0, 0));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await root
        .locator(':scope > .task-row-heading')
        .evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await assertControls(root, width);
      await nested
        .locator(':scope > .task-row-heading')
        .evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await assertControls(nested, width);
      const headerBefore = await geometry(nested);
      await own(nested, '[data-outcome="done"]').click();
      assert.equal((await geometry(nested)).height, headerBefore.height);
      await own(nested, '[data-outcome="done"]').click();
      await save('inline-' + width + '-twenty');
    }
    await page.evaluate(() => {
      state.taskInbox.push({
        id: 'ordinary-no-order',
        name: 'مهمة عادية',
        listPosition: 1,
      });
      save();
      view = 'dashboard';
      plannerTab = 'inbox';
      plannerQuery = '';
      plannerStatus = plannerPriority = plannerProject = 'all';
      render();
    });
    const ordinary = page.locator('#app [data-task-id="ordinary-no-order"]');
    assert.equal(await own(ordinary, '.project-task-order').count(), 0);
    assert.equal(await own(ordinary, '[data-task-edit]').isVisible(), true);
    assert.equal(await own(ordinary, '[data-progress]').isVisible(), true);
    assert.equal(
      (await page
        .locator('.planner-project-tasks [data-project-order-key]')
        .count()) > 0,
      true,
    );
    for (const width of [1440, 820, 390, 320]) {
      await page.setViewportSize({ width, height: width > 650 ? 1080 : 844 });
      await own(ordinary, '[data-task-edit]').click();
      const editor = page.locator('#plannerEditor');
      if (width === 1440)
        assert.ok(
          (await editor.boundingBox()).height < 700,
          'editor fits its contents',
        );
      const expected = editor.locator('[name="expectedSlots"]');
      const completed = editor.locator('[name="completedSlots"]');
      const er = await expected.boundingBox(),
        cr = await completed.boundingBox();
      assert.ok(
        er.width <= 80 && cr.width <= 80,
        'slot inputs fit their numbers',
      );
      assert.ok(Math.abs(er.y - cr.y) < 2, 'slot inputs stay side by side');
      if (width <= 650) assert.ok(er.height >= 40 && cr.height >= 40);
      assert.equal(
        await editor.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        true,
      );
      assert.equal(
        await editor.locator('.planner-schedule-details').getAttribute('open'),
        null,
      );
      await editor.locator('.planner-schedule-details > summary').click();
      assert.equal(
        await editor.locator('[name="startSlot"]').isVisible(),
        true,
      );
      await editor.locator('.planner-schedule-details > summary').click();
      await expected.fill('8');
      await completed.fill('3');
      await save('compact-editor-' + width);
      await editor.locator('button.primary').click();
      assert.equal(await editor.isVisible(), false);
      assert.equal(await own(ordinary, '[data-progress]').inputValue(), '3');
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: inline five controls without selection, stable heights, 30/240 tafsir, 20 siblings, nested/shared task, direct editing and desktop/tablet/phone hit targets',
    );
  } finally {
    await page.close();
  }
};
