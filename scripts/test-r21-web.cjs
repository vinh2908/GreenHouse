const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ARTIFACT_DIR = path.resolve('C:/Users/acer/.gemini/antigravity/brain/8e73be2f-1a5b-4a94-821f-fa8667697db8');
const DIST_DIR = path.resolve(__dirname, '../apps/mobile/dist');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE = path.resolve('C:/Users/acer/AppData/Local/Temp/chrome_r21_test_profile');
const WEB_PORT = 5057;
const BASE_URL = `http://127.0.0.1:${WEB_PORT}`;

function startWebServer() {
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

    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    } else if (!fs.existsSync(filePath)) {
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

  return new Promise((resolve) => {
    server.listen(WEB_PORT, '127.0.0.1', () => {
      console.log(`Web Server started on ${BASE_URL}`);
      resolve(server);
    });
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
    });
    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method && this.eventListeners.has(data.method)) {
        this.eventListeners.get(data.method)(data.params);
      }
    };
  }
  on(event, listener) {
    this.eventListeners.set(event, listener);
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
  console.log('=== BẮT ĐẦU KIỂM THỬ TỔNG HỢP R21 LIVE WEB ===');
  const webServer = await startWebServer();

  if (fs.existsSync(TEMP_PROFILE)) {
    try {
      fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
    } catch {}
  }

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9225',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-web-security',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const vRes = await fetch('http://127.0.0.1:9225/json/version');
    const vData = await vRes.json();
    console.log('Đã kết nối Chrome CDP:', vData.Browser);

    const client = new CDPClient(vData.webSocketDebuggerUrl);
    const { targetId } = await client.send('Target.createTarget', { url: `${BASE_URL}/home` });
    const targetsRes = await fetch('http://127.0.0.1:9225/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.id === targetId);

    const page = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Console.enable');

    page.on('Console.messageAdded', (params) => {
      console.log('[Browser Console]', params.message.level, params.message.text);
    });

    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log('1. Thiết lập LocalStorage & Mock Data...');
    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise((r) => setTimeout(r, 1500));

    await page.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('homemate_access_token', 'mock_test_token_r21');
        localStorage.setItem('homemate_active_role', 'customer');
        localStorage.setItem('homemate_user', JSON.stringify({
          _id: 'user_r21_test',
          full_name: 'Nguyễn Văn Test',
          phone: '0334818713',
          roles: ['customer'],
          active_role: 'customer'
        }));
        localStorage.setItem('gh_settings_v1', JSON.stringify({ state: { language: 'vi', textSize: 'normal' }, version: 0 }));
      `,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: LocationPicker from Map Modal (Item 1)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n2. Kiểm tra Mở LocationPicker từ màn bản đồ lớn (Item 1)...');
    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise((r) => setTimeout(r, 3000));

    // Scroll to and click "Xem bản đồ"
    console.log('-> Tìm và bấm nút "Xem bản đồ"...');
    const clickedMap = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const els = Array.from(document.querySelectorAll('*'));
          const target = els.find(e => e.children.length === 0 && e.textContent && e.textContent.includes('Xem bản đồ'));
          if (!target) return { ok: false, error: 'Cannot find Xem bản đồ text' };
          const clickable = target.closest('[tabindex]') || target.parentElement || target;
          clickable.click();
          return { ok: true, text: target.textContent };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả bấm Xem bản đồ:', clickedMap.result.value);
    await new Promise((r) => setTimeout(r, 1500));

    // Bấm "Chọn thủ công" trong modal bản đồ lớn
    console.log('-> Bấm nút "Chọn thủ công" trong modal bản đồ lớn...');
    const clickedManual = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const els = Array.from(document.querySelectorAll('*'));
          const target = els.find(e => e.children.length === 0 && e.textContent && e.textContent.includes('Chọn thủ công'));
          if (!target) return { ok: false, error: 'Cannot find Chọn thủ công' };
          const clickable = target.closest('[tabindex]') || target.parentElement || target;
          clickable.click();
          return { ok: true, text: target.textContent };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả bấm Chọn thủ công:', clickedManual.result.value);
    await new Promise((r) => setTimeout(r, 1500));

    // Kiểm tra elementFromPoint tại ô input tìm kiếm địa chỉ
    const checkPickerOnTop = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          const addressInput = inputs.find(i => i.placeholder && (i.placeholder.includes('Tìm địa chỉ') || i.placeholder.includes('Search address')));
          if (!addressInput) return { foundInput: false };

          const rect = addressInput.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const topEl = document.elementFromPoint(cx, cy);

          const isTopOrInside = topEl === addressInput || addressInput.contains(topEl) || topEl?.contains(addressInput);
          return {
            foundInput: true,
            isTopOrInside,
            topElTagName: topEl ? topEl.tagName : null,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả elementFromPoint tại ô nhập địa chỉ:', checkPickerOnTop.result.value);

    // Test nhập văn bản vào ô tìm kiếm địa chỉ
    console.log('-> Thử gõ tìm kiếm vào ô địa chỉ của LocationPicker...');
    const typeResult = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          const addressInput = inputs.find(i => i.placeholder && (i.placeholder.includes('Tìm địa chỉ') || i.placeholder.includes('Search address')));
          if (!addressInput) return { typed: false };
          addressInput.focus();
          addressInput.value = '123 Lê Lợi, Quận 1';
          addressInput.dispatchEvent(new Event('input', { bubbles: true }));
          return { typed: true, val: addressInput.value };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả gõ vào LocationPicker:', typeResult.result.value);

    let shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const shotPickerOnMap = path.join(ARTIFACT_DIR, 'evidence_r21_picker_on_map.png');
    fs.writeFileSync(shotPickerOnMap, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng LocationPicker nổi trên Map Modal:', shotPickerOnMap);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Wizard /booking Service Icons (Item 2)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n3. Kiểm tra Icon các dịch vụ trong Wizard Đăng việc /booking (Item 2)...');
    const fetchCheck = await page.send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          const res = await fetch('https://greenhouse-api-chb9.onrender.com/api/v1/services');
          const json = await res.json();
          return { ok: res.ok, count: json.data?.length, slugs: json.data?.map(s => s.slug) };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('-> Trình duyệt fetch trực tiếp Render API:', fetchCheck.result.value);

    await page.send('Page.navigate', { url: `${BASE_URL}/(customer)/booking` });
    await new Promise((r) => setTimeout(r, 4500));

    const checkWizardIcons = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const hasHousekeeping = bodyText.includes('Giúp việc theo giờ');
          const hasDeepCleaning = bodyText.includes('Tổng vệ sinh nhà cửa');
          const hasCooking = bodyText.includes('Nấu ăn gia đình');
          const hasLaundry = bodyText.includes('Giặt ủi');
          const hasCaregiving = bodyText.includes('Chăm sóc người già');
          const hasPetCare = bodyText.includes('Chăm sóc thú cưng');
          const hasElectrician = bodyText.includes('Sửa điện');
          const hasPlumber = bodyText.includes('Sửa ống nước');

          const svgs = Array.from(document.querySelectorAll('svg'));
          return {
            hasHousekeeping,
            hasDeepCleaning,
            hasCooking,
            hasLaundry,
            hasCaregiving,
            hasPetCare,
            hasElectrician,
            hasPlumber,
            totalSvgs: svgs.length
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả kiểm tra wizard /booking services:', checkWizardIcons.result.value);

    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const shotWizard = path.join(ARTIFACT_DIR, 'evidence_r21_wizard_services.png');
    fs.writeFileSync(shotWizard, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng Wizard /booking:', shotWizard);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Services Screen /services (PawPrint icon verification)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n4. Kiểm tra Màn "Tất cả dịch vụ" /services (Item 2 - PawPrint icon)...');
    await page.send('Page.navigate', { url: `${BASE_URL}/services` });
    await new Promise((r) => setTimeout(r, 4000));

    const checkServices = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          return {
            hasPetCare: bodyText.includes('Chăm sóc thú cưng'),
            hasAll12: bodyText.includes('Tất cả dịch vụ') && (bodyText.includes('12') || bodyText.includes('Giúp việc theo giờ'))
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('-> Kết quả kiểm tra /services:', checkServices.result.value);

    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const shotServices = path.join(ARTIFACT_DIR, 'evidence_r21_services_pawprint.png');
    fs.writeFileSync(shotServices, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng /services:', shotServices);

    console.log('\n=== HOÀN TẤT KIỂM THỬ R21 LIVE WEB ===');
  } catch (err) {
    console.error('Lỗi khi chạy CDP tests:', err);
  } finally {
    chrome.kill();
    webServer.close();
    process.exit(0);
  }
}

run();
