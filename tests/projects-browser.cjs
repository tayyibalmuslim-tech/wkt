const assert = require('node:assert/strict');
module.exports = async function projectsBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  try {
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];delete state.tafsirDefaultInstalled;installDefaultTafsir(state);state.projects.push({id:'phone-project',name:'مشروع صغير'});state.taskInbox.push({id:'phone-task',name:'مهمة صغيرة',projectId:'phone-project'});projectViews.clear();expandedTaskRows.clear();view='projects';selectedProject=TAFSIR_PROJECT_ID;render();window.projectsPageRenderCount=0;const realProjectsRender=render;render=(...args)=>{window.projectsPageRenderCount++;return realProjectsRender(...args)};`,
      );
    });
    const roots = page.locator('#projectTaskList > .task-row'),
      panel = page.locator('#projectDetails');
    assert.equal(await roots.count(), 30);
    assert.equal(
      await page.locator('#projectTaskList .task-children .task-row').count(),
      0,
    );
    await roots
      .nth(2)
      .locator(':scope > .task-row-heading [data-task-toggle]')
      .click();
    await panel.evaluate((e) => (e.scrollTop = 280));
    const before = await panel.evaluate((e) => e.scrollTop);
    await page.locator('[data-project="phone-project"]').click();
    await page.locator('[data-project="wkt-core-tafsir-v1"]').click();
    assert.equal(await panel.evaluate((e) => e.scrollTop), before);
    assert.equal(
      await page.locator('#projectTaskList .task-children .task-row').count(),
      8,
    );
    await page.locator('#projectSearch').fill('الربع الثامن ج٣٠');
    assert.equal(await roots.count(), 1);
    assert.equal(await page.locator('[data-project-match]').count(), 1);
    assert.ok(
      (await page.locator('#projectTaskList').textContent()).includes(
        'الجزء الثلاثون',
      ),
    );
    await page.locator('#projectSearch').press('Enter');
    assert.equal(
      await page
        .locator('[data-project-match] [data-task-select]')
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.locator('#projectSearch').focus();
    await page.locator('#projectSearch').press('Escape');
    assert.equal(await roots.count(), 30);
    assert.equal(await panel.evaluate((e) => e.scrollTop), before);
    await page.locator('#collapseProjectTasks').click();
    assert.equal(
      await page.locator('#projectTaskList .task-children .task-row').count(),
      0,
    );
    await page.locator('#expandProjectTasks').click();
    assert.equal(await page.locator('#projectTaskList .task-row').count(), 270);
    await page.locator('#collapseProjectTasks').click();
    const first = roots.first(),
      id = await first.getAttribute('data-task-id');
    await first
      .locator(':scope > .task-row-heading [data-task-select]')
      .click();
    await first
      .locator(':scope > .task-row-actions .task-row-secondary > summary')
      .click();
    const order = first.locator(
      ':scope > .task-row-actions [data-project-order-key]',
    );
    await order.fill('2');
    const rankScroll = await panel.evaluate((e) => e.scrollTop);
    await order.press('Enter');
    assert.equal(await roots.nth(1).getAttribute('data-task-id'), id);
    assert.equal(await panel.evaluate((e) => e.scrollTop), rankScroll);
    assert.equal(await page.evaluate(() => window.projectsPageRenderCount), 0);
    await page
      .locator(
        '[data-task-id="' + id + '"] > .task-row-actions [data-outcome="done"]',
      )
      .click();
    assert.ok(
      (await page.locator('.project-heading-count').textContent()).includes(
        '1/30',
      ),
    );
    const editScroll = await panel.evaluate((e) => e.scrollTop);
    await page
      .locator(
        '[data-task-id="' + id + '"] > .task-row-actions [data-task-edit]',
      )
      .click();
    await page.locator('#plannerForm [name="taskName"]').fill('جزء معدّل');
    await page.locator('#plannerForm .planner-form-actions .primary').click();
    assert.equal(await panel.evaluate((e) => e.scrollTop), editScroll);
    const payload = {
      format: 'wkt-project-v1',
      version: 1,
      project: { name: 'استيراد للاختبار' },
      tasks: [{ id: 'root', name: 'مهمة مستوردة' }],
    };
    await page.locator('.project-page-menu > summary').click();
    await page.locator('#projectImport').setInputFiles({
      name: 'project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload)),
    });
    await page
      .locator('.project-heading h2')
      .filter({ hasText: 'استيراد للاختبار' })
      .waitFor();
    const imported = await page.locator('#projectSelect').inputValue(),
      taskId = await roots.first().getAttribute('data-task-id');
    await page.locator('.project-heading > .project-menu > summary').click();
    await page.locator('#deleteProject').click();
    assert.equal(
      await page.evaluate(
        (id) => eval('state.taskInbox').some((t) => t.id === id),
        taskId,
      ),
      true,
      'unlink deletion retains the imported task',
    );
    assert.equal(
      await page.locator('[data-project="' + imported + '"]').count(),
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.project-sidebar').isVisible(), false);
    assert.equal(await page.locator('#projectSelect').isVisible(), true);
    await page.locator('#projectSelect').selectOption('phone-project');
    assert.equal(await roots.count(), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const targets = await page
      .locator(
        '.project-page-actions button,.project-page-menu > summary,#projectSelect,.project-list-toolbar button,.project-heading > .project-menu > summary',
      )
      .evaluateAll((list) =>
        list
          .filter((e) => e.getClientRects().length)
          .map((e) => e.getBoundingClientRect().height),
      );
    assert.ok(targets.every((h) => h >= 40));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: projects desktop/mobile switching, tafsir search/lazy branches, scroll, reorder, task edit, additive import and unlink deletion',
    );
  } finally {
    await page.close();
  }
};
