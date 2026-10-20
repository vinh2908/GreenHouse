// Actual exported React UI, two browser contexts, real Socket.IO transport.
// REST/job data, GPS and routing are fixtures; this never contacts production.
// Build first with EXPO_PUBLIC_API_URL=http://127.0.0.1:3199/api/v1
// and EXPO_PUBLIC_WS_URL=http://127.0.0.1:3199, output dist-qa/map-web.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { Server } = require('../apps/api/node_modules/socket.io');
const modules = path.resolve(__dirname, '../node_modules/.pnpm');
const { chromium } = require(
  path.join(
    modules,
    fs.readdirSync(modules).find(p => /^playwright@\d/.test(p)),
    'node_modules/playwright',
  ),
);
const root = path.resolve(__dirname, '../apps/mobile/dist-qa/map-web');
const origin = 'http://127.0.0.1:3199';
const jobId = '111111111111111111111111';
const users = {
  customer: {
    _id: '222222222222222222222222',
    full_name: 'QA Customer',
    roles: ['customer'],
    active_role: 'customer',
    phone: '0900000000',
  },
  helper: {
    _id: '333333333333333333333333',
    full_name: 'QA Helper',
    roles: ['helper'],
    active_role: 'helper',
    phone: '0900000001',
  },
};
const job = {
  _id: jobId,
  title: 'QA GPS journey',
  description: 'Isolated tracking fixture',
  status: 'helper_on_the_way',
  customer_id: users.customer,
  helper_id: users.helper,
  service_id: { _id: '444444444444444444444444', name: 'QA Service' },
  address: {
    full_address: 'QA meeting point',
    district: 'QA',
    city: 'QA',
    location: { type: 'Point', coordinates: [108.141, 16.061] },
  },
  events: [],
  photos: [],
  videos: [],
  created_at: new Date().toISOString(),
  payment_status: 'unpaid',
};
let latest = null,
  packets = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, origin);
  if (url.pathname.startsWith('/api/v1')) {
    let data = {};
    const endpoint = url.pathname.replace('/api/v1', '');
    if (endpoint === `/jobs/${jobId}`) data = job;
    else if (endpoint.endsWith('/quotes')) data = [];
    else if (endpoint.endsWith('/contract')) data = null;
    else if (endpoint === '/jobs/helper/my') data = [job];
    else if (endpoint === '/jobs/available') data = { jobs: [], total: 0 };
    else if (endpoint === '/helpers/me/profile')
      data = {
        user_id: users.helper,
        verification_status: 'approved',
        status: 'online',
        service_ids: [],
        location: { coordinates: [108.14, 16.06] },
      };
    else if (endpoint === '/services') data = [];
    else if (endpoint === '/notifications/unread-count') data = { count: 0 };
    else if (endpoint === '/users/me')
      data = String(req.headers.authorization).includes('helper') ? users.helper : users.customer;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data }));
    return;
  }
  let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!fs.existsSync(file) && fs.existsSync(path.dirname(file))) {
    const template = fs.readdirSync(path.dirname(file)).find(name => /^\[.+\]\.html$/.test(name));
    if (template) file = path.join(path.dirname(file), template);
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    'Content-Type',
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.ttf': 'font/ttf',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    }[path.extname(file)] || 'application/octet-stream',
  );
  fs.createReadStream(file).pipe(res);
});
const io = new Server(server);
io.on('connection', socket => {
  socket.on('join:job', ({ job_id }) => {
    socket.join('job:' + job_id);
    if (latest && job_id === jobId) socket.emit('helper:location_update', latest);
    socket.emit('joined', { room: 'job:' + job_id });
  });
  socket.on('leave:job', ({ job_id }) => socket.leave('job:' + job_id));
  socket.on('helper:location', packet => {
    if (packet.job_id !== jobId) return;
    packets++;
    latest = {
      job_id: jobId,
      helper_id: users.helper._id,
      location: {
        lat: packet.lat,
        lng: packet.lng,
        recorded_at: packet.recorded_at,
        accuracy: packet.accuracy,
      },
    };
    io.to('job:' + jobId).emit('helper:location_update', latest);
  });
});
let browser;
const errors = [];
(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3199, '127.0.0.1', resolve);
  });
  const assets = {};
  for (const file of ['leaflet.min.js', 'leaflet.min.css']) {
    const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/' + file);
    assert.ok(response.ok);
    assets[file] = await response.text();
  }
  browser = await chromium.launch({ headless: true });
  async function open(role, route) {
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
      geolocation: { latitude: 16.06, longitude: 108.14, accuracy: 5 },
      permissions: ['geolocation'],
    });
    await context.addInitScript(
      ({ user, role }) => {
        localStorage.setItem('homemate_access_token', 'qa-' + role);
        localStorage.setItem('homemate_refresh_token', 'qa-refresh');
        localStorage.setItem('homemate_user', JSON.stringify(user));
      },
      { user: users[role], role },
    );
    await context.route('**/*', async request => {
      const url = request.request().url();
      if (url.startsWith(origin)) return request.continue();
      // Metro may reuse an API_URL inlined from .env. Fulfil fixture REST here;
      // never forward test credentials to the deployed API.
      if (
        new URL(url).origin === 'https://greenhouse-api-chb9.onrender.com' &&
        new URL(url).pathname.startsWith('/api/v1/')
      ) {
        const response = await request.fetch({
          url: origin + new URL(url).pathname + new URL(url).search,
        });
        return request.fulfill({
          response,
          headers: {
            ...response.headers(),
            'access-control-allow-origin': '*',
            'access-control-allow-headers': '*',
          },
        });
      }
      if (url.includes('cdnjs.cloudflare.com')) {
        const file = url.split('/').pop();
        return request.fulfill({
          body: assets[file],
          contentType: file.endsWith('.js') ? 'application/javascript' : 'text/css',
        });
      }
      if (url.includes('router.project-osrm.org')) {
        const [start, end] = new URL(url).pathname
          .split('/')
          .pop()
          .split(';')
          .map(c => c.split(',').map(Number));
        return request.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'Ok',
            routes: [
              {
                distance: 220,
                duration: 120,
                geometry: { type: 'LineString', coordinates: [start, [start[0], end[1]], end] },
              },
            ],
          }),
        });
      }
      return request.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(role + ': ' + error.message));
    await page.goto(origin + route);
    return { page, context };
  }
  const customer = await open('customer', '/job-detail/' + jobId);
  const helper = await open('helper', '/helper-job-detail/' + jobId);
  const map = page => page.frameLocator('iframe[title="Bản đồ theo dõi người giúp việc"]');
  await customer.page
    .getByText('Người giúp việc đang di chuyển đến bạn', { exact: true })
    .waitFor();
  await helper.page.getByText('Đang di chuyển đến nhà khách hàng', { exact: true }).waitFor();
  await map(customer.page).locator('.rider.live').waitFor();
  await map(helper.page).locator('.rider.live').waitFor();
  assert.ok(packets >= 1);
  assert.equal(latest.location.lat, 16.06);
  console.log(
    'PASS actual React customer/helper deep links restore auth, watch GPS and deliver via socket',
  );
  const frame = customer.page.frames().find(f => f.url() === 'about:srcdoc');
  await frame.evaluate(() => {
    window.__qaIdentity = Math.random();
  });
  const identity = await frame.evaluate(() => window.__qaIdentity);
  const before = packets;
  await helper.context.setGeolocation({ latitude: 16.061, longitude: 108.1408, accuracy: 5 });
  const deadline = Date.now() + 15000;
  while (packets === before && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(packets > before);
  assert.equal(latest.location.lat, 16.061);
  assert.equal(await frame.evaluate(() => window.__qaIdentity), identity);
  await map(customer.page).locator('#info').filter({ hasText: 'Còn ' }).waitFor();
  console.log('PASS live browser GPS updates customer map/ETA without reloading its iframe');
  await customer.page.reload();
  await map(customer.page).locator('.rider').waitFor();
  console.log('PASS reload job detail restores socket and receives latest GPS snapshot');
  const sos = await open('customer', '/sos-tracking/' + jobId);
  await sos.page.getByText('Người giúp việc đang di chuyển đến bạn', { exact: true }).waitFor();
  await map(sos.page).locator('.rider.live').waitFor();
  console.log('PASS actual SOS tracking screen uses the same live GPS stream');
  await customer.page.screenshot({ path: 'reports/qa-map-customer.png', fullPage: true });
  await helper.page.screenshot({ path: 'reports/qa-map-helper.png', fullPage: true });
  const beforeNavigation = packets;
  await helper.page.locator('svg').first().click();
  await helper.page.waitForURL('**/jobs');
  await helper.context.setGeolocation({ latitude: 16.0605, longitude: 108.14, accuracy: 5 });
  const navigationDeadline = Date.now() + 15000;
  while (packets === beforeNavigation && Date.now() < navigationDeadline)
    await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(packets > beforeNavigation, 'GPS must continue after leaving job detail');
  console.log('PASS helper GPS continues after navigating to the jobs tab');
  assert.deepEqual(errors, []);
  console.log('PASS no uncaught JavaScript errors in three actual React screens');
  console.log(
    'TOTAL: 6 UI integration checks passed (fixture REST/OSRM, real Socket.IO and browser geolocation)',
  );
})()
  .catch(async error => {
    console.error(error, errors);
    for (const context of browser?.contexts() || []) {
      for (const page of context.pages())
        console.error(
          'UI diagnostic',
          page.url(),
          (await page.locator('body').innerText()).slice(0, 2500),
        );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    io.close();
    server.close();
  });
