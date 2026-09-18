const puppeteer = require('puppeteer');

async function testBrowser() {
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  console.log('Chrome launched.');

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

  console.log('Navigating to http://127.0.0.1:3001/login ...');
  await page.goto('http://127.0.0.1:3001/login', { waitUntil: 'domcontentloaded', timeout: 15000 });
  console.log('DOM Content Loaded! Title:', await page.title());

  await page.waitForSelector('input[name="email"], input[type="email"], input', { timeout: 5000 });
  const inputs = await page.$$eval('input', els => els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder })));
  console.log('Found Inputs on Login Screen:', inputs);

  await page.screenshot({ path: 'admin_login_screen.png' });
  console.log('Screenshot saved to admin_login_screen.png');

  await browser.close();
}

testBrowser().catch(console.error);
