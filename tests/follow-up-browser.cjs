const { chromium } = require('playwright'),
  fs = require('node:fs'),
  http = require('node:http'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const p = path.resolve(
    root,
    '.' + (req.url === '/' ? '/index.html' : req.url),
  );
  if (!p.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader(
      'Content-Type',
      p.endsWith('.js')
        ? 'text/javascript'
        : p.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    );
    res.end(fs.readFileSync(p));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (r) =>
      r.fulfill({ body: '', contentType: 'text/javascript' }),
    );
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      state.starterIntroPending = false;
      view = 'followUp';
      render();
    });
    await page.click('#fuCreate');
    await page.evaluate(() => {
      const r = FollowUp.current();
      r.days['2026-10-02'] = {
        id: '2026-10-02',
        updatedAt: r.updatedAt,
        status: 'partial',
        summary: 'تقييم يوم تجريبي طويل '.repeat(12),
        positives: 'إنجاز جزئي',
        advice: 'مراجعة الخطة',
      };
      FollowUp.commit(r);
      render();
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.fill('#fuDate', '2026-10-02');
      await page.locator('#fuDate').dispatchEvent('change');
      await page.click('[data-level="day"]');
      assert.equal(await page.locator('.fu-note').count(), 3);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.click('#fuEdit');
      await page.fill('textarea[name="advice"]', 'نصيحة يدوية');
      await page.click('.fu-editor button.primary');
      assert.ok(
        (await page.locator('.fu').innerText()).includes('نصيحة يدوية'),
      );
      await page.screenshot({
        path: '/tmp/follow-up-' + width + '.png',
        fullPage: true,
      });
    }
    const before = await page.evaluate(() => JSON.stringify(state));
    const downloadPromise = page.waitForEvent('download');
    await page.click('#fuBackup');
    const downloaded = await downloadPromise;
    const payload = JSON.parse(
      fs.readFileSync(await downloaded.path(), 'utf8'),
    );
    assert.ok(payload.followUpReference.days['2026-10-02']);
    assert.ok(
      payload.followUpReference.updateInstructions.includes('مرجع المتابعة'),
    );
    assert.equal(await page.evaluate(() => JSON.stringify(state)), before);
    assert.equal(
      await page.evaluate(() => Object.hasOwn(state, 'followUpReference')),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      'Follow-up desktop/mobile reading, editing, overflow and combined backup passed',
    );
  } finally {
    await browser?.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
