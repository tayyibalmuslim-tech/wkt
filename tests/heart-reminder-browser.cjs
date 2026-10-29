/* Real layout, keyboard, touch and offline reading. Firebase is stubbed. */
const { chromium } = require('playwright'), assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  try {res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':'text/html');res.end(fs.readFileSync(file));}
  catch {res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.WKT_CHROMIUM_EXECUTABLE?{executablePath:process.env.WKT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
    for(const [width,height] of [[320,568],[390,844],[1280,900],[844,390]]) {
      for(const colorScheme of ['light','dark']) {
        const context=await browser.newContext({viewport:{width,height},colorScheme,reducedMotion:'reduce',hasTouch:width<900});
        const page=await context.newPage(), errors=[], requests=[];
        page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
        await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/,route=>route.fulfill({body:'',contentType:'text/javascript'}));
        await context.grantPermissions(['clipboard-read','clipboard-write']);
        await page.goto('http://127.0.0.1:'+server.address().port);
        await page.evaluate(()=>{
          document.querySelectorAll('dialog[open]').forEach(d=>d.close());
          eval("state.starterIntroPending=false;state.reminder={enabled:true,nextAt:Date.now()-1,text:'old'};save();checkReminder();");
        });
        // Preview also works while reminders are disabled and preserves their deadline.
        await page.evaluate(()=>eval("acknowledgeReminder();state.reminder.enabled=false;view='settings';render();"));
        const beforePreview=await page.evaluate(()=>eval('JSON.stringify(state.reminder)'));
        await page.getByRole('button',{name:'تجربة تذكير القلب',exact:true}).click();
        await page.evaluate(()=>eval('checkReminder()'));
        assert.equal(await page.locator('#reminderDialog').evaluate(el=>el.open),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>eval('JSON.stringify(state.reminder)')),beforePreview);
        await page.evaluate(()=>eval("state.reminder.enabled=true;state.reminder.nextAt=Date.now()-1;save();checkReminder();"));
        const dialog=page.locator('#reminderDialog');
        assert.equal(await dialog.locator('.heart-section').count(),11);
        assert.equal(await page.locator('dialog[open]').count(),1);
        async function geometry() {
          const metrics=await dialog.evaluate(el=>{
            const rect=el.getBoundingClientRect(), close=document.querySelector('#acknowledgeReminder').getBoundingClientRect(), body=document.querySelector('#heartBody'), footer=document.querySelector('.heart-bottom').getBoundingClientRect();
            return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,close:close.toJSON(),footer:footer.toJSON(),overflow:body.scrollWidth-body.clientWidth,color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor};
          });
          assert.ok(metrics.left>=0 && metrics.right<=width+1);
          assert.ok(metrics.top>=0 && metrics.bottom<=height+1);
          assert.ok(metrics.close.top>=0 && metrics.close.bottom<=height);
          assert.ok(metrics.footer.top>=0 && metrics.footer.bottom<=height);
          assert.ok(metrics.overflow<=1);
          return metrics;
        }
        await geometry();
        // Native Tab keeps focus inside the modal.
        for(let i=0;i<15;i++) {await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement===document.body || document.querySelector('#reminderDialog').contains(document.activeElement)),true);}
        await page.locator('[data-section="resolve"]').click();
        await page.evaluate(()=>document.fonts.ready);
        assert.equal(await dialog.locator('.heart-text-card').count(),2);
        assert.equal(await dialog.locator('.heart-verse').count(),1);
        assert.equal(await dialog.locator('.heart-hadith').count(),1);
        const firstVerse=await dialog.locator('.heart-verse').textContent();
        await dialog.getByRole('button',{name:'الآية التالية',exact:true}).click();
        assert.notEqual(await dialog.locator('.heart-verse').textContent(),firstVerse);
        assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'الآية التالية');
        await dialog.getByRole('button',{name:'الآية السابقة',exact:true}).press('Enter');
        assert.equal(await dialog.locator('.heart-verse').textContent(),firstVerse);
        await dialog.locator('.heart-copy').first().click();
        const copied=await page.evaluate(()=>navigator.clipboard.readText());
        assert.ok(copied.includes(firstVerse) && copied.includes('العنكبوت: 69'));
        await geometry();
        await dialog.getByRole('button',{name:'كل الآيات',exact:true}).click();
        assert.equal(await dialog.locator('.heart-verse').count(),5);
        await dialog.locator('#heartBody').evaluate(el=>el.scrollTop=el.scrollHeight);await geometry();
        await page.locator('#heartBack').click();
        await page.locator('#heartBack').click();
        assert.equal(await page.evaluate(()=>document.activeElement.dataset.section),'resolve');
        // Every section and every full list remains reachable offline, with no data fetches.
        const before=requests.length;
        await context.setOffline(true);
        const sections=await page.evaluate(()=>window.HeartReminderData.map(s=>({id:s.id,q:s.verses.length,h:s.hadiths.length})));
        for(const s of sections) {
          await page.locator(`[data-section="${s.id}"]`).click();
          await geometry();
          await dialog.getByRole('button',{name:'كل الآيات',exact:true}).click();
          assert.equal(await dialog.locator('.heart-text-card').count(),s.q);
          await geometry();await page.locator('#heartBack').click();
          await dialog.getByRole('button',{name:'كل الأحاديث',exact:true}).click();
          assert.equal(await dialog.locator('.heart-text-card').count(),s.h);
          await geometry();await page.locator('#heartBack').click();await page.locator('#heartBack').click();
        }
        assert.equal(requests.length,before);
        await context.setOffline(false);
        if(process.env.WKT_SCREENSHOT_DIR && width===390) {
          fs.mkdirSync(process.env.WKT_SCREENSHOT_DIR,{recursive:true});
          await page.screenshot({path:path.join(process.env.WKT_SCREENSHOT_DIR,`heart-sections-${colorScheme}.png`)});
          await page.locator('[data-section="resolve"]').click();
          await page.screenshot({path:path.join(process.env.WKT_SCREENSHOT_DIR,`heart-reader-${colorScheme}.png`)});
        }
        await page.keyboard.press('Escape');
        assert.equal(await dialog.evaluate(el=>el.open),false);
        const deadline=await page.evaluate(()=>eval('state.reminder.nextAt'));
        assert.ok(Math.abs(deadline-Date.now()-3*60*60*1000)<5000);
        await page.reload();assert.equal(await dialog.evaluate(el=>el.open),false);
        assert.deepEqual(errors,[]);
        console.log(`PASS heart reader ${width}x${height} ${colorScheme}: layout, focus, copy, complete offline lists, recurrence, reload`);
        await context.close();
      }
    }
  } finally {await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
