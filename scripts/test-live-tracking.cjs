/* Run: node scripts/test-live-tracking.cjs
 * Browser tests use real Leaflet, mocked OSRM/tiles and synthetic GPS; no real accounts/data.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(relative, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: name => (name in mocks ? mocks[name] : require(name)),
    Date,
    URL,
    Number,
    process: { env: {} },
    setTimeout,
    clearTimeout,
    console: { log() {}, warn() {} },
  });
  return module.exports;
}
function playwright() {
  try {
    return require('playwright');
  } catch {
    const dir = fs
      .readdirSync(path.join(root, 'node_modules/.pnpm'))
      .find(p => /^playwright@\d/.test(p));
    return require(path.join(root, 'node_modules/.pnpm', dir, 'node_modules/playwright'));
  }
}
const { acceptTrackingEvent, trackingTitle, validCoordinate } = load(
  'apps/mobile/services/tracking.ts',
);
const { TRACKING_MAP_HTML } = load('apps/mobile/components/common/tracking-map-document.ts');
const endpointConfig = load('apps/mobile/services/endpoint-config.ts');
let passed = 0;
function check(name, run) {
  run();
  console.log('PASS', name);
  passed++;
}
check('public deployments reject QA localhost and LAN endpoints', () => {
  for (const url of ['http://127.0.0.1:3199', 'http://localhost:3199', 'http://192.168.1.8:3000']) {
    assert.equal(endpointConfig.usableEndpoint(url, 'greenhouse-customer.vercel.app'), false);
  }
});
check('local browser QA remains allowed; release native rejects localhost', () => {
  assert.equal(endpointConfig.usableEndpoint('http://127.0.0.1:3199', '127.0.0.1'), true);
  assert.equal(endpointConfig.usableEndpoint('http://127.0.0.1:3199', undefined, false), false);
});
check('public API endpoint remains allowed', () =>
  assert.equal(endpointConfig.usableEndpoint('https://greenhouse-api-chb9.onrender.com', 'greenhouse-customer.vercel.app'), true));
const now = Date.now(),
  event = {
    job_id: 'job1',
    helper_id: 'helper1',
    location: { lat: 16.06, lng: 108.14, recorded_at: now, accuracy: 5 },
  };
check('valid GPS for assigned job/helper', () =>
  assert.equal(acceptTrackingEvent(event, 'job1', 'helper1'), true),
);
check('ignore GPS from another job', () =>
  assert.equal(acceptTrackingEvent(event, 'job2', 'helper1'), false),
);
check('ignore GPS from another helper', () =>
  assert.equal(acceptTrackingEvent(event, 'job1', 'helper2'), false),
);
check('ignore duplicate/out-of-order GPS', () =>
  assert.equal(acceptTrackingEvent(event, 'job1', 'helper1', event.location), false),
);
check('ignore expired GPS', () =>
  assert.equal(acceptTrackingEvent(event, 'job1', 'helper1', null, now + 121000), false),
);
check('ignore future GPS', () =>
  assert.equal(acceptTrackingEvent(event, 'job1', 'helper1', null, now - 20000), false),
);
check('ignore inaccurate GPS', () =>
  assert.equal(
    acceptTrackingEvent({ ...event, location: { ...event.location, accuracy: 400 } }, 'job1'),
    false,
  ),
);
check('coordinate zero is valid; strings/NaN/out-of-bounds rejected', () => {
  assert.ok(validCoordinate(0, 0));
  for (const p of [
    [NaN, 1],
    ['16', 108],
    [91, 108],
    [16, 181],
  ])
    assert.equal(validCoordinate(...p), false);
});
check('exact role-specific text', () => {
  assert.equal(trackingTitle('helper_on_the_way', 'helper'), 'Đang di chuyển đến nhà khách hàng');
  assert.equal(
    trackingTitle('helper_on_the_way', 'customer'),
    'Người giúp việc đang di chuyển đến bạn',
  );
});
const component = fs.readFileSync(
  path.join(root, 'apps/mobile/components/common/live-tracking-map.tsx'),
  'utf8',
);
check('React document/source stable and status text not truncated', () => {
  assert.match(component, /srcDoc=\{TRACKING_MAP_HTML\}/);
  assert.match(component, /source=\{WEBVIEW_SOURCE\}/);
  assert.doesNotMatch(component, /numberOfLines=\{1\}/);
});

(async () => {
  const emitted = [],
    listeners = {};
  const socket = {
    connected: true,
    id: 'test-socket',
    on: (name, callback) => {
      listeners[name] = callback;
    },
    emit: (name, payload) => emitted.push({ name, payload, volatile: false }),
    volatile: { emit: (name, payload) => emitted.push({ name, payload, volatile: true }) },
    removeAllListeners() {},
    disconnect() {
      this.connected = false;
    },
  };
  const { socketService } = load('apps/mobile/services/socket.service.ts', {
    'socket.io-client': { io: () => socket },
    '@/services/secure-storage': { getItemAsync: async () => 'isolated-test-token' },
    'expo-constants': { default: { expoConfig: { extra: { wsUrl: 'http://localhost' } } } },
    '@homemate/constants': { SOCKET_EVENTS: {} },
    '@/services/api-client': { default: {} },
    '@/services/endpoint-config': endpointConfig,
  });
  await socketService.connect();
  socketService.joinJob('job1');
  socketService.joinJob('job1');
  socketService.leaveJob('job1');
  check('shared job room stays joined until last screen subscriber leaves', () => {
    assert.equal(emitted.filter(e => e.name === 'leave:job').length, 0);
  });
  socketService.leaveJob('job1');
  check('last room subscriber leaves exactly once', () => {
    assert.equal(emitted.filter(e => e.name === 'leave:job').length, 1);
  });
  socketService.joinJob('job2');
  listeners.connect();
  check('socket reconnect rejoins active job rooms', () => {
    assert.equal(
      emitted.filter(e => e.name === 'join:job' && e.payload.job_id === 'job2').length,
      2,
    );
  });
  socket.connected = false;
  socketService.updateLocation('job2', 16, 108, now, 10);
  check('offline GPS is not queued for delayed replay', () => {
    assert.equal(emitted.filter(e => e.name === 'helper:location').length, 0);
  });
  socket.connected = true;
  socketService.updateLocation('job2', 16, 108, now, 10);
  socketService.updateLocation('job2', 16, 108, now, 10);
  check('GPS uses volatile delivery, original capture time and deduplication', () => {
    const packets = emitted.filter(e => e.name === 'helper:location');
    assert.equal(packets.length, 1);
    assert.equal(packets[0].volatile, true);
    assert.equal(packets[0].payload.recorded_at, now);
  });
  socketService.disconnect();
  emitted.length = 0;
  listeners.connect();
  check('logout clears tracked job rooms', () => assert.equal(emitted.length, 0));
  const { chromium } = playwright();
  const browser = await chromium.launch({ headless: true });
  try {
    // Download the pinned Leaflet assets once; repeat tests do not depend on CDN timing.
    const assets = {};
    for (const file of ['leaflet.min.js', 'leaflet.min.css']) {
      const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/' + file);
      assert.ok(response.ok);
      assets[file] = await response.text();
    }
    for (const mode of ['android-web', 'native-bridge']) {
      const context = await browser.newContext({
        viewport: { width: 393, height: 300 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let requests = 0,
        failRoute = false,
        delayedRoute = false;
      await page.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('cdnjs.cloudflare.com')) {
          const file = url.split('/').pop();
          return route.fulfill({
            body: assets[file],
            contentType: file.endsWith('.js') ? 'application/javascript' : 'text/css',
          });
        }
        if (url.includes('router.project-osrm.org')) {
          requests++;
          if (failRoute) return route.fulfill({ status: 503, body: '{}' });
          const coordinates = new URL(url).pathname
            .split('/')
            .pop()
            .split(';')
            .map(p => p.split(',').map(Number));
          const [from, to] = coordinates;
          const body = JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 220,
                duration: 120,
                geometry: {
                  type: 'LineString',
                  coordinates: [from, [from[0], to[1]], to],
                },
              },
            ],
          });
          if (delayedRoute) await new Promise(resolve => setTimeout(resolve, 800));
          return route
            .fulfill({
              contentType: 'application/json',
              headers: { 'access-control-allow-origin': '*' },
              body,
            })
            .catch(() => {});
        }
        // Map tiles are external image data, not under test.
        return route.abort();
      });
      const instrumentation = `
        window.__messages=[];
        ${
          mode === 'native-bridge'
            ? 'window.ReactNativeWebView={postMessage:function(s){window.__messages.push(JSON.parse(s))}};'
            : "window.addEventListener('message',function(e){if(e.data.type==='metrics')window.__messages.push(e.data)});"
        }
        L.Map.addInitHook(function(){window.__map=this});
      `;
      await page.setContent(
        TRACKING_MAP_HTML.replace('(function(){', instrumentation + '\n(function(){'),
        { waitUntil: 'load' },
      );
      await page.waitForFunction(() => typeof window.applyTrackingState === 'function');
      const home = { lat: 16.061, lng: 108.141 },
        start = { lat: 16.06, lng: 108.14 };
      let captured = Date.now();
      let state = {
        channel: 'greenhouse-tracking',
        type: 'state',
        customer: home,
        helper: null,
        tracking: true,
        layer: 'streets',
      };
      async function update(overrides) {
        state = { ...state, ...overrides };
        await page.evaluate(value => window.applyTrackingState(value), state);
      }
      await update({});
      check(mode + ': no fabricated rider/ETA while waiting for GPS', () => {});
      assert.equal(await page.locator('.rider').count(), 0);
      assert.match(await page.locator('#info').innerText(), /Đang chờ GPS/);
      await update({ helper: { ...start, recorded_at: captured } });
      await page
        .waitForFunction(() => document.querySelector('#info').textContent.includes('Còn '))
        .catch(async error => {
          console.error('Renderer diagnostic', {
            requests,
            errors,
            info: await page.locator('#info').innerText(),
          });
          throw error;
        });
      assert.equal(await page.locator('.rider').count(), 1);
      assert.equal(await page.locator('.rider.live').count(), 1);
      const marker = () =>
        page.evaluate(() => {
          let point;
          window.__map.eachLayer(layer => {
            if (layer instanceof L.Marker && layer.getElement()?.classList.contains('rider'))
              point = layer.getLatLng();
          });
          return point;
        });
      const id = await page.evaluate(() => window.__map._leaflet_id);
      const target = { lat: 16.061, lng: 108.1408 };
      await update({ helper: { ...target, recorded_at: ++captured } });
      await page.waitForTimeout(180);
      const middle = await marker();
      assert.ok(
        Math.abs(middle.lng - start.lng) < 0.00002 || Math.abs(middle.lat - home.lat) < 0.00002,
        'intermediate animation must follow road segments, not cut across the corner',
      );
      await page.waitForFunction(() => {
        let found = false;
        window.__map.eachLayer(layer => {
          if (layer instanceof L.Marker && layer.getElement()?.classList.contains('rider'))
            found = Math.abs(layer.getLatLng().lng - 108.1408) < 0.000001;
        });
        return found;
      });
      check(mode + ': smooth road-following animation with radar', () => {});
      const metrics = await page.evaluate(() =>
        window.__messages.filter(m => m.type === 'metrics' && m.value).map(m => m.value),
      );
      assert.ok(metrics.at(-1).distanceKm < metrics[0].distanceKm);
      check(mode + ': remaining distance/ETA recalculate on new GPS', () => {});
      const count = requests;
      await page.evaluate(() => window.__map.setView([16.09, 108.16], 17, { animate: false }));
      for (let i = 0; i < 8; i++)
        await update({
          helper: { lat: target.lat, lng: target.lng + i * 0.000001, recorded_at: ++captured },
        });
      assert.equal(requests, count, 'do not refetch route for every GPS packet');
      await update({ layer: 'satellite' });
      assert.equal(await page.evaluate(() => window.__map._leaflet_id), id);
      assert.equal(await page.evaluate(() => window.__map.getZoom()), 17);
      assert.ok(
        Math.abs((await page.evaluate(() => window.__map.getCenter().lat)) - 16.09) < 0.00001,
      );
      check(mode + ': continuous GPS/layer updates preserve map and throttle routing', () => {});
      await page.evaluate(() => {
        const original = Date.now;
        window.__realNow = original;
        Date.now = () => original() + 45000;
      });
      await page.waitForFunction(() =>
        document.querySelector('#info').textContent.includes('GPS chưa cập nhật'),
      );
      assert.equal(await page.locator('.rider.live').count(), 0);
      check(mode + ': stale GPS freezes animation/radar and removes ETA', () => {});
      await page.evaluate(() => {
        Date.now = () => window.__realNow() + 180000;
      });
      await page.waitForFunction(() => !document.querySelector('.rider'));
      check(mode + ': expired GPS removes rider', () => {});
      await page.evaluate(() => {
        Date.now = window.__realNow;
      });
      failRoute = true;
      await update({ helper: { ...start, recorded_at: Date.now() } });
      await page.waitForFunction(() =>
        document.querySelector('#info').textContent.includes('Chưa tính được tuyến'),
      );
      assert.equal(await page.locator('.rider').count(), 1);
      assert.equal(
        (await page.evaluate(() => window.__messages.filter(m => m.type === 'metrics').at(-1)))
          .value,
        null,
      );
      check(mode + ': routing failure preserves GPS but shows no fabricated ETA', () => {});
      failRoute = false;
      delayedRoute = true;
      await update({
        customer: { lat: 16.062, lng: 108.142 },
        helper: { ...start, recorded_at: Date.now() + 1 },
      });
      await update({ tracking: false, helper: null });
      await page.waitForTimeout(1000);
      assert.equal(await page.locator('.rider').count(), 0);
      assert.match(await page.locator('#info').innerText(), /Điểm hẹn làm việc/);
      check(mode + ': late routing response cannot resurrect a finished trip', () => {});
      await update({ customer: null });
      assert.equal(await page.locator('.home').count(), 0);
      assert.match(await page.locator('#info').innerText(), /chưa có tọa độ/);
      check(mode + ': invalid destination does not fall back to another city', () => {});
      assert.deepEqual(errors, []);
      check(mode + ': no browser JavaScript exceptions', () => {});
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`TOTAL: ${passed} checks passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
