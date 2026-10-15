/* Dashboard layout acceptance; requires the optional Chromium installation. */
const assert = require('node:assert/strict');
module.exports = async function dashboardBrowser(browser, url) {
  const page = await browser.newPage();
  await page.route(/\/(?:sync\.js|vendor\/firebase-[^/]+\.js)$/, (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' }),
  );
  try {
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      eval(
        `state.starterIntroPending=false;state.sunsetDays={};state.repeat=[];state.projects=[];state.taskInbox=Array.from({length:50},(_,i)=>({id:'dash-'+i,name:'مهمة '+i}));view='dashboard';plannerTab='inbox';plannerQuery='';plannerStatus=plannerPriority=plannerProject='all';render();`,
      );
    });
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        'dashboard fits viewport',
      );
      const size = await page.locator('#dashboardQuickName').boundingBox();
      assert.ok(size.height >= 40);
      await page.locator('#dashboardQuickName').fill('مهمة من المتصفح');
      await page.locator('#dashboardQuickTask button').click();
      assert.equal(await page.locator('#dashboardQuickName').inputValue(), '');
      await page.locator('[data-task-id="dash-35"]').scrollIntoViewIfNeeded();
      const before = await page.evaluate(
        () => document.scrollingElement.scrollTop,
      );
      await page.evaluate(() =>
        eval(`openPlannerEditor(findTask('dash-35',''))`),
      );
      await page.locator('#plannerForm [name="taskName"]').fill('اسم معدل');
      await page.locator('#plannerForm button.primary').click();
      const after = await page.evaluate(
        () => document.scrollingElement.scrollTop,
      );
      assert.ok(
        Math.abs(after - before) <= 2,
        'editing retains the real page scroll',
      );
    }
  } finally {
    await page.close();
  }
};
