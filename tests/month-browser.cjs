/* Optional real layout coverage: npm run test:browser (after installing Chromium). */
const { chromium } = require('playwright'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  http = require('node:http'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    '.' + decodeURIComponent(req.url === '/' ? '/index.html' : req.url),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader(
      'Content-Type',
      file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.WKT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.WKT_CHROMIUM_EXECUTABLE }
        : {}),
    });
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Exercise the local app without connecting a test browser to production Firebase.
    await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (route) =>
      route.fulfill({ body: '', contentType: 'text/javascript' }),
    );
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(`
   state.starterIntroPending=false;date='2026-11-01';state.sunsetDays={};state.repeat=[];state.taskInbox=[];
   taskDay(date).tasks=Array.from({length:120},(_,i)=>({id:'layout-'+i,name:i===119?'مهمة طويلة جدًا '.repeat(15):'م'+i,prayers:[3],priority:3}));
   view='dashboard';plannerTab='month';plannerMonth='2026-11';render();
  `);
    });
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const rect = (e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            right: r.right,
            bottom: r.bottom,
          };
        };
        const chips = [...document.querySelectorAll('.month-task')],
          day = chips[0].closest('.month-day'),
          scroller = document.querySelector('.task-month-scroll');
        return {
          count: chips.length,
          first: rect(chips[0]),
          second: rect(chips[1]),
          last: rect(chips.at(-1)),
          day: rect(day),
          neighbor: rect(day.nextElementSibling),
          scrollWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth,
          overflow: chips.some((e) => e.scrollWidth > e.clientWidth + 1),
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(layout.count, 120);
      assert.equal(layout.first.y, layout.second.y, 'short chips share a line');
      assert.ok(layout.last.y > layout.first.y, 'chips wrap into more lines');
      assert.ok(
        layout.last.bottom <= layout.day.bottom,
        'all chips fit the expanded day',
      );
      assert.equal(
        layout.day.height,
        layout.neighbor.height,
        'week cells have equal height',
      );
      assert.equal(layout.overflow, false, 'long names wrap without clipping');
      assert.equal(
        layout.pageOverflow,
        false,
        'horizontal overflow stays in calendar',
      );
      if (viewport.width < 650)
        assert.ok(layout.scrollWidth > layout.clientWidth);
      const chip = page.locator('[data-month-task="layout-0"]');
      await chip.scrollIntoViewIfNeeded();
      const before = await chip.boundingBox();
      await chip.click();
      const after = await chip.boundingBox();
      assert.deepEqual(after, before, 'menu never moves the task');
      const menu = page.locator('#monthTaskMenu');
      assert.equal(await menu.locator('button').count(), 3);
      const bounds = await menu.boundingBox();
      assert.ok(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= viewport.width &&
          bounds.y + bounds.height <= viewport.height,
      );
      await page.keyboard.press('Escape');
      assert.equal(await menu.count(), 0);
      await chip.click();
      await page.locator('[data-month-outcome="done"]').click();
      await page.locator('[data-month-task="layout-0"].done').waitFor();
      await chip.click();
      await page.locator('[data-month-outcome="done"]').click();
      await page.locator('[data-month-task="layout-0"].pending').waitFor();
      // An anchor low in a long day must position its menu above itself when needed.
      await page.locator('[data-month-task="layout-119"]').click();
      const low = await menu.boundingBox();
      assert.ok(low.y >= 0 && low.y + low.height <= viewport.height);
      await page.keyboard.press('Escape');
    }
    await require('./task-rows-browser.cjs')(
      browser,
      'http://127.0.0.1:' + server.address().port,
    );
    await require('./projects-browser.cjs')(
      browser,
      'http://127.0.0.1:' + server.address().port,
    );
    await require('./dashboard-browser.cjs')(
      browser,
      'http://127.0.0.1:' + server.address().port,
    );
    await require('./day-browser.cjs')(
      browser,
      'http://127.0.0.1:' + server.address().port,
    );
    await require('./accessibility-browser.cjs')(
      browser,
      'http://127.0.0.1:' + server.address().port,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Chromium desktop/mobile, horizontal wrapping, expanded rows, long text, menu positioning and toggling',
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
