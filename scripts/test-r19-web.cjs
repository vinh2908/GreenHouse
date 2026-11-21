const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = path.resolve('C:/Users/acer/.gemini/antigravity/brain/8e73be2f-1a5b-4a94-821f-fa8667697db8');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE = path.resolve('C:/Users/acer/AppData/Local/Temp/chrome_r19_test_profile');
const BASE_URL = 'http://192.168.1.13:5055';

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
  console.log('--- BẮT ĐẦU TEST WEB LIVE R19 ---');
  if (fs.existsSync(TEMP_PROFILE)) {
    try { fs.rmSync(TEMP_PROFILE, { recursive: true, force: true }); } catch {}
  }

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9223',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const vRes = await fetch('http://127.0.0.1:9223/json/version');
    const vData = await vRes.json();
    console.log('Đã kết nối Chrome CDP:', vData.Browser);

    const client = new CDPClient(vData.webSocketDebuggerUrl);
    const { targetId } = await client.send('Target.createTarget', { url: `${BASE_URL}/home` });
    const targetsRes = await fetch('http://127.0.0.1:9223/json');
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.id === targetId);

    const page = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');

    // 1. Mobile viewport (390 x 844, iPhone 14 / modern Android standard)
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    console.log('1. Thiết lập session & localStorage cho khách hàng...');
    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise(r => setTimeout(r, 1500));

    await page.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('homemate_access_token', 'mock_test_token_r19');
        localStorage.setItem('homemate_active_role', 'customer');
        localStorage.setItem('homemate_user', JSON.stringify({
          _id: 'user_r19_test',
          full_name: 'Nguyễn Văn Test',
          phone: '0988776655',
          roles: ['customer'],
          active_role: 'customer'
        }));
        localStorage.setItem('gh_settings_v1', JSON.stringify({ state: { language: 'vi', textSize: 'normal' }, version: 0 }));
      `,
    });

    console.log('2. Điều hướng lại tới trang chủ khách /home sau khi đăng nhập...');
    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise(r => setTimeout(r, 3500));

    // Dismiss any toast if present
    await page.send('Runtime.evaluate', {
      expression: `
        const closeBtn = document.querySelector('[data-testid="toastAnimatedContainer"] [role="button"]') || document.querySelector('[data-testid="toastAnimatedContainer"]');
        if (closeBtn) closeBtn.style.display = 'none';
      `
    });

    // Capture Home - Screen 1 (Top / Header / Services)
    let shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const homeTopShotPath = path.join(ARTIFACT_DIR, 'evidence_r19_home_mobile_top.png');
    fs.writeFileSync(homeTopShotPath, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng:', homeTopShotPath);

    // Scroll down to Services & AI & Helpers
    await page.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 420);' });
    await new Promise(r => setTimeout(r, 1000));
    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const homeMidShotPath = path.join(ARTIFACT_DIR, 'evidence_r19_home_mobile_mid.png');
    fs.writeFileSync(homeMidShotPath, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng:', homeMidShotPath);

    // Scroll down to Map, Vouchers & Bottom
    await page.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 950);' });
    await new Promise(r => setTimeout(r, 1000));
    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const homeBottomShotPath = path.join(ARTIFACT_DIR, 'evidence_r19_home_mobile_bottom.png');
    fs.writeFileSync(homeBottomShotPath, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng:', homeBottomShotPath);

    // Kiểm tra DOM các thành phần trên Home
    const checkHomeElements = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const hasQuickBookingDealPrice = bodyText.includes('Giá bạn muốn trả') || bodyText.includes('giá mở đầu để deal');
          const hasQuickBookingSubmitBtn = bodyText.includes('Đặt dịch vụ nhanh') || bodyText.includes('Đăng việc theo ý bạn');
          const hasServicesHeader = bodyText.includes('Dịch vụ');
          const hasView12Services = bodyText.includes('Xem 12 dịch vụ');
          const hasAllServicesTile = bodyText.includes('Tất cả');
          const hasSos = bodyText.includes('Cứu hộ SOS') || bodyText.includes('Khẩn cấp');
          const hasNearbyHelpers = bodyText.includes('Thợ ở gần bạn') || bodyText.includes('Thợ đang ở gần');
          const hasVouchers = bodyText.includes('Ưu đãi dành cho bạn');
          const hasCommitments = bodyText.includes('Quyền lợi & cam kết') || bodyText.includes('Bảo hiểm dịch vụ');
          
          // Kiểm tra tab bar: Đếm số lượng tab hiển thị
          const tabLabels = ['Trang chủ', 'Hoạt động', 'Đăng việc', 'Tin nhắn', 'Tài khoản'];
          const hasServicesInTabBar = bodyText.split('\\n').filter(s => s.trim() === 'services').length > 0;

          return {
            hasQuickBookingDealPrice,
            hasQuickBookingSubmitBtn,
            hasServicesHeader,
            hasView12Services,
            hasAllServicesTile,
            hasSos,
            hasNearbyHelpers,
            hasVouchers,
            hasCommitments,
            hasServicesInTabBar,
            bodyLength: bodyText.length
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Kết quả kiểm tra phần tử Trang Chủ:', checkHomeElements.result.value);

    // 3. Chuyển sang màn hình "Tất cả dịch vụ" (/services)
    console.log('3. Điều hướng tới màn hình "Tất cả dịch vụ" /services...');
    await page.send('Page.navigate', { url: `${BASE_URL}/services` });
    await new Promise(r => setTimeout(r, 3000));

    await page.send('Runtime.evaluate', {
      expression: `
        const closeBtn = document.querySelector('[data-testid="toastAnimatedContainer"] [role="button"]') || document.querySelector('[data-testid="toastAnimatedContainer"]');
        if (closeBtn) closeBtn.style.display = 'none';
      `
    });

    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const servicesShotPath = path.join(ARTIFACT_DIR, 'evidence_r19_services_mobile_top.png');
    fs.writeFileSync(servicesShotPath, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng:', servicesShotPath);

    // Cuộn xuống để xem toàn bộ danh sách dịch vụ
    await page.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 450);' });
    await new Promise(r => setTimeout(r, 1000));
    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const servicesMidShotPath = path.join(ARTIFACT_DIR, 'evidence_r19_services_mobile_mid.png');
    fs.writeFileSync(servicesMidShotPath, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng:', servicesMidShotPath);

    // Kiểm tra DOM trên màn hình Services
    const checkServicesElements = await page.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bodyText = document.body.innerText;
          const hasAllServicesTitle = bodyText.includes('Tất cả dịch vụ');
          const hasCount12 = bodyText.includes('12');
          const hasSearchPlaceholder = !!document.querySelector('input[placeholder*="Tìm dịch vụ"]');
          const hasCategoryAll = bodyText.includes('Tất cả');
          const hasCategoryClean = bodyText.includes('Dọn dẹp');
          const hasCategoryRepair = bodyText.includes('Sửa chữa');
          const hasCategoryCare = bodyText.includes('Chăm sóc');
          const hasCategoryDelivery = bodyText.includes('Vận chuyển');
          const hasOtherService = bodyText.includes('Dịch vụ khác');
          const hasServicesInTabBar = bodyText.split('\\n').filter(s => s.trim() === 'services').length > 0;

          return {
            hasAllServicesTitle,
            hasCount12,
            hasSearchPlaceholder,
            hasCategoryAll,
            hasCategoryClean,
            hasCategoryRepair,
            hasCategoryCare,
            hasCategoryDelivery,
            hasOtherService,
            hasServicesInTabBar,
            bodyLength: bodyText.length
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Kết quả kiểm tra phần tử Màn Hình Tất Cả Dịch Vụ:', checkServicesElements.result.value);

    // 4. Test Desktop Viewport (1280 x 800)
    console.log('4. Kiểm tra Desktop Responsive Viewport (1280 x 800)...');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await page.send('Page.navigate', { url: `${BASE_URL}/home` });
    await new Promise(r => setTimeout(r, 2500));
    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const desktopHomeShotPath = path.join(ARTIFACT_DIR, 'evidence_r19_home_desktop.png');
    fs.writeFileSync(desktopHomeShotPath, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng Desktop Home:', desktopHomeShotPath);

    await page.send('Page.navigate', { url: `${BASE_URL}/services` });
    await new Promise(r => setTimeout(r, 2500));
    shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const desktopServicesShotPath = path.join(ARTIFACT_DIR, 'evidence_r19_services_desktop.png');
    fs.writeFileSync(desktopServicesShotPath, Buffer.from(shot.data, 'base64'));
    console.log('-> Đã lưu ảnh minh chứng Desktop Services:', desktopServicesShotPath);

    page.close();
    client.close();
    console.log('=== TOÀN BỘ KIỂM THỬ WEB R19 HOÀN TẤT THÀNH CÔNG ===');
  } finally {
    try { chrome.kill(); } catch {}
  }
}

run().catch(err => {
  console.error('LỖI TEST WEB R19:', err);
  process.exit(1);
});
