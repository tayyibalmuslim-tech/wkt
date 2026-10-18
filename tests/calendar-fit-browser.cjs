const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function calendarFitBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (r) =>
    r.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  try {
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(`state.starterIntroPending=false;state.repeat=[];state.sunsetDays={};state.taskInbox=[];date='2026-11-01';plannerMonth='2026-11';plannerWeek=date;
      for(let i=0;i<30;i++){const key=addDate(date,i);taskDay(key).tasks=Array.from({length:4},(_,j)=>({id:'cal-'+i+'-'+j,name:j===3?'اسم مهمة طويل جدًا '.repeat(12):'مهمة '+(j+1),description:'وصف مخفي عن التقويم',prayers:[3],priority:3,expectedSlots:2}));}
      taskDay(date).tasks.push({id:'cal-child',name:'فرعية',description:'وصف فرعي مخفي',parentId:'cal-0-0',parentDate:date,prayers:[3],expectedSlots:1},{id:'cal-deep',name:'فرعية عميقة',description:'وصف عميق مخفي',parentId:'cal-child',parentDate:date,prayers:[3],expectedSlots:1});view='dashboard';plannerTab='month';save();render();`);
    });
    for (const width of [1920, 1366, 820, 390, 320]) {
      await page.setViewportSize({ width, height: width > 650 ? 1080 : 844 });
      for (const tab of ['month', 'week']) {
        await page.evaluate((tab) => {
          plannerTab = tab;
          expandedTaskRows.clear();
          taskDay(date).done = {};
          taskDay(date).failed = {};
          render();
        }, tab);
        const selector = tab === 'month' ? '.task-month-scroll' : '.task-week';
        assert.equal(
          await page.locator(selector + ' .task-inline-description').count(),
          0,
        );
        const sizes = await page.evaluate((selector) => {
          const e = document.querySelector(selector);
          return {
            scroll: e.scrollWidth,
            client: e.clientWidth,
            page: document.documentElement.scrollWidth,
            width: innerWidth,
            description: e.textContent.includes('وصف مخفي'),
            seven: document.querySelectorAll('.week-day').length,
          };
        }, selector);
        assert.ok(
          sizes.scroll <= sizes.client + 1,
          `${tab} ${width}: ${JSON.stringify(sizes)}`,
        );
        assert.ok(
          sizes.page <= sizes.width,
          `${tab} page ${width}: ${JSON.stringify(sizes)}`,
        );
        assert.equal(sizes.description, false);
        if (tab === 'month') {
          assert.equal(await page.locator('.month-day').count(), 30);
          assert.equal(
            await page.locator('.month-task').count(),
            122,
            'all tasks remain visible, without more buttons',
          );
          const chip = page.locator('[data-month-task="cal-0-0"]');
          const box = await chip.boundingBox();
          if (width <= 650)
            assert.ok(
              box.width >= 39.9 && box.height >= 39.9,
              '40px mobile task targets',
            );
          await chip.click();
          await page.locator('[data-month-outcome="failed"]').click();
          await page.locator('[data-failure-only]').click();
          assert.equal(await chip.getAttribute('class'), 'month-task failed');
          await chip.click();
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#monthTaskMenu').count(), 0);
        } else {
          assert.equal(sizes.seven, 7);
          const root = page
            .locator('.week-day')
            .first()
            .locator('[data-task-id="cal-0-0"]');
          await root
            .locator(':scope > .task-row-heading [data-task-toggle]')
            .click();
          const child = root.locator('[data-task-id="cal-child"]');
          await child
            .locator(':scope > .task-row-heading [data-task-toggle]')
            .click();
          assert.equal(
            await page.locator('.task-week .task-inline-description').count(),
            0,
            'lazy descendants omit descriptions too',
          );
          await child
            .locator(':scope > .task-row-heading [data-outcome="done"]')
            .click();
          assert.ok(
            (await child.getAttribute('class')).split(/\s+/).includes('done'),
          );
          await child
            .locator(':scope > .task-row-heading [data-task-edit]')
            .click();
          assert.equal(
            await page
              .locator('#plannerForm [name=taskDescription]')
              .inputValue(),
            'وصف فرعي مخفي',
            'stored description stays editable',
          );
          await page.locator('#closePlanner').click();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          );
          assert.equal(
            overflow,
            false,
            'expanded nested rows stay inside viewport',
          );
        }
        if (process.env.WKT_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.WKT_SCREENSHOTS_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(
              process.env.WKT_SCREENSHOTS_DIR,
              `calendar-${tab}-${width}.png`,
            ),
          });
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: month/week fit 1920/1366/820/390/320px without horizontal scrolling; descriptions omitted including lazy descendants; all month tasks, 40px targets, outcomes and editing retained',
    );
  } finally {
    await page.close();
  }
};

