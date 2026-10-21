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
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.WKT_CHROMIUM_EXECUTABLE?{executablePath:process.env.WKT_CHROMIUM_EXECUTABLE}:{})});
    for (const width of [390,1280]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/,route=>route.fulfill({body:'',contentType:'text/javascript'}));
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.evaluate(()=>{
        document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        eval("state.starterIntroPending=false;state.prayerActionPlans={2:state.actions.slice(0,3).map((a,i)=>({id:a.id,slots:6-i}))};view='day';render();save();");
      });
      assert.equal(await page.locator('[data-prayer="2"] .prayer-action-chip').count(),3);
      const geometry=await page.locator('[data-prayer="2"] .prayer-action-summary').evaluate(el=>({wrap:getComputedStyle(el).flexWrap,width:el.clientWidth,scroll:el.scrollWidth,rect:el.getBoundingClientRect().toJSON()}));
      assert.equal(geometry.wrap,'wrap');assert.ok(geometry.scroll<=geometry.width+1);
      assert.ok(geometry.rect.right<=width && geometry.rect.left>=0);
      assert.equal(await page.locator('[data-prayer="2"] .prayer-count').count(),1);
      assert.equal(await page.locator('[data-prayer="2"] .prayer-tasks-button').count(),1);
      await page.reload();
      assert.equal(await page.locator('[data-prayer="2"] .prayer-action-chip').count(),3);
      await page.evaluate(()=>eval("view='settings';render();"));
      await page.locator('#prayerActionPrayer').selectOption('2');
      const input=page.locator('[data-plan-id] input').first();
      await input.fill('8');await input.press('Tab');
      assert.equal(await input.inputValue(),'8');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log('PASS: prayer plans desktop/mobile wrapping, settings, existing prayer information and reload');
  } finally { await browser?.close();server.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
