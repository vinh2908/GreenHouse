// Live, unauthenticated smoke test: do not mock tiles. Catches DNS/provider failures
// that deterministic renderer tests deliberately do not cover.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const modules = path.resolve(__dirname, '../node_modules/.pnpm');
const { chromium } = require(
  path.join(
    modules,
    fs.readdirSync(modules).find(name => /^playwright@\d/.test(name)),
    'node_modules/playwright',
  ),
);
const moduleObject = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, '../apps/mobile/components/common/tracking-map-document.ts'),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  { exports: moduleObject.exports },
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 700, height: 320 } });
    const failures = [];
    page.on('requestfailed', request =>
      failures.push({
        url: request.url(),
        reason: request.failure()?.errorText,
      }),
    );
    await page.setContent(moduleObject.exports.TRACKING_MAP_HTML, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.applyTrackingState);
    await page.evaluate(() =>
      window.applyTrackingState({
        channel: 'greenhouse-tracking',
        type: 'state',
        customer: { lat: 16.06, lng: 108.14 },
        helper: null,
        tracking: true,
        layer: 'streets',
      }),
    );
    await page.waitForFunction(
      () => document.querySelectorAll('img.leaflet-tile-loaded').length >= 4,
    );
    console.log(
      'PASS live street map tiles load without mocks',
      await page.locator('img.leaflet-tile-loaded').count(),
    );
    await page.screenshot({ path: 'reports/qa-map-live-tiles.png' });
    await page.evaluate(() =>
      window.applyTrackingState({
        channel: 'greenhouse-tracking',
        type: 'state',
        customer: { lat: 16.06, lng: 108.14 },
        helper: null,
        tracking: true,
        layer: 'satellite',
      }),
    );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('img.leaflet-tile-loaded')].filter(img =>
          img.src.includes('World_Imagery'),
        ).length >= 4,
    );
    console.log('PASS live satellite tiles load without mocks');
    if (failures.length) console.log('Network failures observed', failures);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
