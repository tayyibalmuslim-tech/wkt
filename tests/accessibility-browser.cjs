/* Local UI audit. Firebase is mocked; no real accounts or remote writes. */
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
module.exports = async function accessibilityBrowser(browser, url) {
  const page = await browser.newPage(),
    errors = [],
    results = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/\/vendor\/firebase-[^/]+\.js$/, (r) =>
    r.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  await page.addInitScript(() => {
    const auth = {
      onAuthStateChanged(cb) {
        queueMicrotask(() => cb(null));
        return () => {};
      },
      setPersistence: async () => {},
      signInWithEmailAndPassword: async () => {},
      createUserWithEmailAndPassword: async () => {},
      sendPasswordResetEmail: async () => {},
    };
    const getAuth = () => auth;
    getAuth.Auth = { Persistence: { LOCAL: 'local' } };
    window.firebase = {
      initializeApp() {},
      auth: getAuth,
      database: () => ({}),
    };
  });
  try {
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.taskInbox=[];state.projects=[];delete state.tafsirDefaultInstalled;installDefaultTafsir(state);const key=activeDay();taskDay(key).tasks=Array.from({length:18},(_,i)=>({id:'review-'+i,name:'مهمة '+i,description:i%3?'':'وصف قصير بجوار المهمة',prayer:prayerOrder[i%5],priority:i%5+1,expectedSlots:3,showInMonthlyCalendar:true}));taskDay(key).done['review-0']=true;(taskDay(key).failed??={})['review-1']=true;state.repeat.push({id:'review-repeat',name:'قراءة يومية',priority:2,prayer:3,days:[0,1,2,3,4,5,6]});`,
      );
    });
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1080 },
      { name: 'tablet', width: 820, height: 1180 },
      { name: 'phone', width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const name of [
        'day',
        'dashboard',
        'projects',
        'month',
        'actions',
        'repeat',
        'settings',
        'account',
        'editor',
      ]) {
        await page.evaluate((name) => {
          document.querySelectorAll('dialog[open]').forEach((d) => d.close());
          eval(
            `view='${name === 'month' ? 'dashboard' : name === 'editor' ? 'projects' : name}';plannerTab='${name === 'month' ? 'month' : 'day'}';plannerMonth=date.slice(0,7);selectedProject=TAFSIR_PROJECT_ID;render();`,
          );
          if (name === 'editor') {
            eval(
              `view='projects';selectedProject=TAFSIR_PROJECT_ID;render();openPlannerEditor(state.taskInbox.find(t=>t.projectId===TAFSIR_PROJECT_ID&&!t.parentId));`,
            );
            document.querySelector('.task-project-details').open = true;
          }
          scrollTo(0, 0);
        }, name);
        const audit = await page.evaluate(
          ({ name, phone }) => {
            const visible = (e) =>
              e.getClientRects().length &&
              getComputedStyle(e).visibility !== 'hidden' &&
              !e.closest('[inert]');
            const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
            const background = (e) => {
              while (e) {
                const c = rgb(getComputedStyle(e).backgroundColor);
                if (c.length >= 3 && (c[3] ?? 1) > 0.99) return c;
                e = e.parentElement;
              }
              return [255, 255, 255];
            };
            const lum = (c) =>
              c
                .slice(0, 3)
                .map((v) => v / 255)
                .map((v) =>
                  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
                )
                .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
            const contrast = [];
            for (const e of document.querySelectorAll(
              'p,small,span,label,h1,h2,h3,h4,button,summary,a,strong',
            )) {
              if (
                !visible(e) ||
                e.closest(':disabled') ||
                ![...e.childNodes].some(
                  (n) => n.nodeType === 3 && n.textContent.trim(),
                )
              )
                continue;
              const style = getComputedStyle(e),
                fg = rgb(style.color),
                bg = background(e);
              if (fg.length < 3) continue;
              const l = [lum(fg), lum(bg)].sort((a, b) => b - a),
                ratio = (l[0] + 0.05) / (l[1] + 0.05),
                large =
                  parseFloat(style.fontSize) >= 24 ||
                  (parseFloat(style.fontSize) >= 18.66 &&
                    +style.fontWeight >= 700);
              if (ratio < (large ? 3 : 4.5))
                contrast.push({
                  tag: e.tagName,
                  cls: e.className,
                  text: e.textContent.trim().slice(0, 50),
                  ratio: +ratio.toFixed(2),
                  fg: style.color,
                  bg,
                });
            }
            const targets = [
              ...document.querySelectorAll(
                'button,a,summary,input:not([type="hidden"]),select,textarea,label.secondary,label:has(>input[type="checkbox"]),.task-priority-options label',
              ),
            ].filter(
              (e) =>
                visible(e) &&
                !e.disabled &&
                !(
                  e.tagName === 'INPUT' &&
                  ['checkbox', 'radio'].includes(e.type)
                ),
            );
            const touch = phone
              ? targets
                  .map((e) => ({ e, r: e.getBoundingClientRect() }))
                  .filter(({ r }) => r.width < 39.5 || r.height < 39.5)
                  .map(({ e, r }) => ({
                    tag: e.tagName,
                    id: e.id,
                    cls: e.className,
                    text: (e.textContent || e.getAttribute('aria-label') || '')
                      .trim()
                      .slice(0, 40),
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                  }))
              : [];
            const nameless = targets
              .filter(
                (e) =>
                  e.tagName === 'BUTTON' &&
                  !e.textContent.trim() &&
                  !e.getAttribute('aria-label') &&
                  !e.title,
              )
              .map((e) => e.outerHTML);
            return {
              name,
              rtl: document.documentElement.dir,
              overflow: document.documentElement.scrollWidth > innerWidth,
              contrast,
              touch,
              nameless,
              backup: !!document
                .querySelector('#downloadBackup')
                ?.getClientRects().length,
            };
          },
          { name, phone: viewport.name === 'phone' },
        );
        results.push({ viewport: viewport.name, ...audit });
        if (process.env.WKT_SCREENSHOTS_DIR) {
          fs.mkdirSync(process.env.WKT_SCREENSHOTS_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(
              process.env.WKT_SCREENSHOTS_DIR,
              `${viewport.name}-${name}.png`,
            ),
            fullPage: false,
          });
        }
      }
    }
    if (process.env.WKT_SCREENSHOTS_DIR)
      fs.writeFileSync(
        path.join(process.env.WKT_SCREENSHOTS_DIR, 'audit.json'),
        JSON.stringify(results, null, 2),
      );
    const issues = results.filter(
      (r) =>
        r.rtl !== 'rtl' ||
        r.overflow ||
        r.contrast.length ||
        r.touch.length ||
        r.nameless.length ||
        !r.backup,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(
      issues,
      [],
      'page contrast, touch targets, RTL, labels and overflow',
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    // Keyboard operation and an actual JSON download, using isolated local fixtures.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.mobile-navigation [data-view="projects"]').click();
    const search = page.locator('#projectSearch');
    await search.focus();
    await search.fill('الربع الثامن ج٣٠');
    await search.press('Enter');
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.matches('[data-task-select]'),
      ),
      true,
    );
    await page.keyboard.press('Escape');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadBackup').click();
    const download = await downloadPromise;
    const payload = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(payload.slotMinutes, 10);
    assert.ok(payload.projects.length);
    await page.locator('#accountButton').click();
    await page.locator('#registerMode').click();
    assert.equal(await page.locator('[name="confirmPassword"]').count(), 1);
    await page.locator('#loginMode').click();
    assert.equal(await page.locator('[name="confirmPassword"]').count(), 0);
    console.log(
      'PASS: 27 desktop/tablet/phone page audits, contrast, targets, RTL, backup download, keyboard and mocked account form',
    );
  } finally {
    await page.close();
  }
};
