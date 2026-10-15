/* Real layout/interaction acceptance checks, called by npm run test:browser. */
const assert = require('node:assert/strict');
module.exports = async function taskRowsBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(`
   state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.projects=[{id:'visual',name:'مشروع هادئ'}];
   state.taskInbox=Array.from({length:24},(_,i)=>({id:'visual-'+i,name:'مهمة '+String(i).padStart(2,'0'),projectId:'visual',priority:3,...(i===23?{name:'اسم طويل جدًا '.repeat(15),description:'وصف طويل جدًا '.repeat(20)}:{})}));
   state.taskInbox.push({id:'visual-child',name:'فرعية',parentId:'visual-0',parentDate:''},{id:'visual-grand',name:'فرعية عميقة',parentId:'visual-child',parentDate:'',expectedSlots:2});
   expandedTaskRows.clear();view='projects';selectedProject='visual';render();
   window.rowsRenderCount=0;const realRowsRender=render;render=(...args)=>{window.rowsRenderCount++;return realRowsRender(...args)};
  `);
    });
    const rows = page.locator('#projectTaskList > .task-row');
    assert.equal(await rows.count(), 24);
    assert.equal(
      await page.locator('[data-task-id="visual-child"]').count(),
      0,
    );
    const geometry = await rows.evaluateAll((list) =>
      list.map((r) => {
        const b = r.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, height: b.height };
      }),
    );
    assert.ok(
      geometry.every((r) => r.height >= 44 && r.height <= 56),
      'desktop default rows are 44–56px',
    );
    assert.ok(
      geometry.filter((r) => r.top >= 0 && r.bottom <= 1080).length >= 15,
      'at least 15 whole rows fit a 1080px viewport',
    );
    const root = page.locator('#projectTaskList > [data-task-id="visual-0"]');
    await root.locator(':scope > .task-row-heading [data-task-toggle]').click();
    assert.equal(
      await page.locator('[data-task-id="visual-child"]').count(),
      1,
    );
    assert.equal(
      await page.locator('[data-task-id="visual-grand"]').count(),
      0,
    );
    await page
      .locator(
        '[data-task-id="visual-child"] > .task-row-heading [data-task-toggle]',
      )
      .click();
    const grand = page.locator('[data-task-id="visual-grand"]');
    await grand
      .locator(':scope > .task-row-heading [data-task-select]')
      .click();
    await grand
      .locator(':scope > .task-row-actions [data-outcome="done"]')
      .click();
    assert.ok(await grand.evaluate((e) => e.classList.contains('done')));
    assert.equal(await page.evaluate(() => window.rowsRenderCount), 0);
    assert.equal(
      await root
        .locator(':scope > .task-row-heading [data-task-toggle]')
        .getAttribute('aria-expanded'),
      'true',
    );
    await page.keyboard.press('Escape');
    const select = root.locator(
      ':scope > .task-row-heading [data-task-select]',
    );
    await select.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.locator('[data-task-id="visual-child"]').count(),
      0,
    );
    await page.keyboard.press('ArrowLeft');
    assert.equal(
      await page.locator('[data-task-id="visual-grand"]').count(),
      1,
    );
    const long = page.locator('[data-task-id="visual-23"]');
    await long.locator(':scope > .task-row-heading [data-task-select]').click();
    assert.ok(
      await long
        .locator(':scope > .task-row-actions .task-row-full')
        .isVisible(),
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        'no page overflow on phone',
      );
      await select.click();
      const targets = await root
        .locator(
          ':scope > .task-row-heading button, :scope > .task-row-actions .task-row-primary button, :scope > .task-row-actions .task-row-secondary > summary',
        )
        .evaluateAll((list) =>
          list
            .filter((e) => e.getClientRects().length)
            .map((e) => ({
              width: e.getBoundingClientRect().width,
              height: e.getBoundingClientRect().height,
            })),
        );
      assert.ok(
        targets.every((r) => r.width >= 40 && r.height >= 40),
        'phone touch targets are at least 40px',
      );
      await select.press('Escape');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await root.evaluate((e) => getComputedStyle(e).transitionDuration),
      '0s',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: task-row desktop density, mobile touch/overflow, full text, lazy hierarchy, keyboard and reduced motion',
    );
  } finally {
    await page.close();
  }
};
