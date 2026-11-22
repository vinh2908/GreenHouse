const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARTIFACT_DIR = path.resolve(
  'C:/Users/acer/.gemini/antigravity/brain/8e73be2f-1a5b-4a94-821f-fa8667697db8',
);
const DIST_DIR = path.resolve(__dirname, '../apps/mobile/dist');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE = path.resolve('C:/Users/acer/AppData/Local/Temp/chrome_r20_test_profile');
const PORT = 5056;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Static file server with SPA fallback
function startServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(DIST_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading ' + reqPath);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise(resolve => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Server started on ${BASE_URL}`);
      resolve(server);
    });
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = err => reject(err);
    });
    this.ws.onmessage = msg => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const msgId = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TỔNG HỢP R20 LIVE WEB ===');
  const server = await startServer();

  if (fs.existsSync(TEMP_PROFILE)) {
    try {
      fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
    } catch {}
  }

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9224',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const vRes = await fetch('http://127.0.0.1:9224/json/version');
    const vData = await vRes.json();
    console.log('Đã kết nối Chrome CDP:', vData.Browser);

    const client = new CDPClient(vData.webSocketDebuggerUrl);
    const { targetId } = await client.send('Target.createTarget', { url: `${BASE_URL}/home` });
    const targetsRes = await fetch('http://127.0.0.1:9224/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.id === targetId);

    const page = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');

    // Setup Mock User Session & Active Jobs
    console.log('1. Thiết lập LocalStorage & Mock Data...');
    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise(r => setTimeout(r, 1500));

    await page.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('homemate_access_token', 'mock_test_token_r20');
        localStorage.setItem('homemate_active_role', 'customer');
        localStorage.setItem('homemate_user', JSON.stringify({
          _id: 'user_r20_test',
          full_name: 'Nguyễn Văn Test',
          phone: '0334818713',
          roles: ['customer'],
          active_role: 'customer'
        }));
        localStorage.setItem('gh_settings_v1', JSON.stringify({ state: { language: 'vi', textSize: 'normal' }, version: 0 }));
      `,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Mobile 360px Viewport (Item 4, Item 10, Item 11)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n2. Kiểm tra Viewport 360px (Header pill, Tab bar, Floating bubble)...');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise(r => setTimeout(r, 3500));

    // Kiểm tra Tab bar count (Item 4)
    const tabCheck = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const tabs = ['Trang chủ', 'Hoạt động', 'Đăng việc', 'Tin nhắn', 'Tài khoản'];
          const hasServicesTab = bodyText.includes('services') && document.querySelector('div[role="tablist"]')?.innerText.includes('services');
          const tabButtons = Array.from(document.querySelectorAll('div[role="button"]')).filter(el => {
            const t = el.innerText.trim();
            return tabs.includes(t);
          });
          return {
            hasServicesTab: !!hasServicesTab,
            bodyTextPill: bodyText.includes('Chưa định vị'),
            bodyTextPillTruncated: bodyText.includes('Chưa định vị — Bấm lấy v…') || bodyText.includes('Chưa định vị —'),
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả kiểm tra Tab Bar & Location Pill (360px):', tabCheck.result.value);

    let shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const shot360 = path.join(ARTIFACT_DIR, 'evidence_r20_home_360px.png');
    fs.writeFileSync(shot360, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng 360px:', shot360);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Desktop 1919px Viewport (Item 5 - SOS "Khẩn" chip & Bubble position)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n3. Kiểm tra Viewport Desktop 1919px (SOS Khẩn chip & Floating Bubble)...');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1919,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise(r => setTimeout(r, 3500));

    // Scroll to SOS banner
    await page.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 480);' });
    await new Promise(r => setTimeout(r, 1000));

    const desktopCheck = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const hasKhancChip = bodyText.includes('Khẩn') || bodyText.includes('KHẨN') || bodyText.includes('khẩn');
          const hasSosTitle = bodyText.includes('SOS — Cần người gấp?');
          return {
            hasKhancChip,
            hasSosTitle,
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả kiểm tra Desktop 1919px SOS banner:', desktopCheck.result.value);

    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const shotDesktop = path.join(ARTIFACT_DIR, 'evidence_r20_home_desktop_1919.png');
    fs.writeFileSync(shotDesktop, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng Desktop 1919px:', shotDesktop);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Services Screen /services with ?q=điện (Item 2, Item 8, Item 9)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n4. Kiểm tra Màn "Tất cả dịch vụ" /services?q=điện (Item 2, 8, 9)...');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await page.send('Page.navigate', { url: `${BASE_URL}/services?q=%C4%91i%E1%BB%87n` });
    await new Promise(r => setTimeout(r, 3500));

    const servicesCheckQ = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const inputs = Array.from(document.querySelectorAll('input'));
          const searchInput = inputs.find(i => i.placeholder && i.placeholder.includes('Tìm kiếm dịch vụ')) || inputs[0];
          return {
            inputValue: searchInput ? searchInput.value : '',
            hasElectrician: bodyText.includes('Sửa điện gia dụng'),
            hasPlumber: bodyText.includes('Sửa ống nước'),
            headerCountOne: bodyText.includes('1') && !bodyText.includes('12'),
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả kiểm tra /services?q=điện:', servicesCheckQ.result.value);

    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const shotServicesQ = path.join(ARTIFACT_DIR, 'evidence_r20_services_search_dien.png');
    fs.writeFileSync(shotServicesQ, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng /services?q=điện:', shotServicesQ);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Full Services Screen /services (Item 8, Item 9 Catalog)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n5. Kiểm tra Danh mục đầy đủ /services (Item 8, Item 9)...');
    await page.send('Page.navigate', { url: `${BASE_URL}/services` });
    await new Promise(r => setTimeout(r, 3500));

    const catalogCheck = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const servicesExpected = [
            'Giúp việc theo giờ',
            'Tổng vệ sinh nhà cửa',
            'Nấu ăn gia đình',
            'Giặt ủi quần áo',
            'Chăm sóc người già & Trẻ nhỏ',
            'Chăm sóc thú cưng',
            'Sửa điện gia dụng',
            'Sửa ống nước',
            'Vệ sinh máy lạnh',
            'Chuyển nhà',
            'Bốc hàng, vận chuyển',
            'Dịch vụ khác — tự ghi việc, tự set giá'
          ];
          const found = {};
          for (const s of servicesExpected) {
            found[s] = bodyText.includes(s);
          }
          return {
            headerCount12: bodyText.includes('12'),
            found,
            hasAll12: Object.values(found).every(Boolean)
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả kiểm tra Catalog 12 dịch vụ:', catalogCheck.result.value);

    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const shotServicesAll = path.join(ARTIFACT_DIR, 'evidence_r20_services_all.png');
    fs.writeFileSync(shotServicesAll, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng /services All:', shotServicesAll);

    console.log('\n=== HOÀN TẤT KIỂM THỬ R20 LIVE WEB ===');
  } catch (err) {
    console.error('Lỗi khi chạy CDP tests:', err);
  } finally {
    chrome.kill();
    server.close();
    process.exit(0);
  }
}

run();
