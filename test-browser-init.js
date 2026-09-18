const puppeteer = require('puppeteer');

async function testBrowser() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('Browser launched successfully!');
  const page = await browser.newPage();
  await page.goto('http://localhost:3001');
  console.log('Navigated to Admin Portal, title:', await page.title());
  await page.screenshot({ path: 'admin_initial.png' });
  console.log('Screenshot saved to admin_initial.png');
  await browser.close();
}

testBrowser().catch(console.error);
