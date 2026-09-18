const { execSync } = require('child_process');
const fs = require('fs');

const ADB = '"C:\\Users\\Windows\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe"';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runAdb(cmd) {
  try {
    return execSync(`${ADB} ${cmd}`, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    console.error(`ADB Error (${cmd}):`, err.message);
    return '';
  }
}

function tap(x, y) {
  runAdb(`shell input tap ${x} ${y}`);
}

function typeText(text) {
  // Replace spaces with %s for adb
  const formatted = text.replace(/ /g, '%s');
  runAdb(`shell input text "${formatted}"`);
}

function swipe(x1, y1, x2, y2, duration = 300) {
  runAdb(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
}

function dumpScreen() {
  runAdb('shell uiautomator dump /sdcard/ui.xml');
  runAdb('pull /sdcard/ui.xml ./device_ui.xml');
  if (fs.existsSync('./device_ui.xml')) {
    return fs.readFileSync('./device_ui.xml', 'utf8');
  }
  return '';
}

function findElement(xml, targetText) {
  // exact text
  const regex = new RegExp(`text="${targetText}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
  let m = regex.exec(xml);
  if (m) {
    const x1 = parseInt(m[1]), y1 = parseInt(m[2]), x2 = parseInt(m[3]), y2 = parseInt(m[4]);
    return { text: targetText, x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), bounds: [x1, y1, x2, y2] };
  }
  // contains text
  const regex2 = new RegExp(`text="[^"]*${targetText}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
  m = regex2.exec(xml);
  if (m) {
    const x1 = parseInt(m[1]), y1 = parseInt(m[2]), x2 = parseInt(m[3]), y2 = parseInt(m[4]);
    return { text: targetText, x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), bounds: [x1, y1, x2, y2] };
  }
  return null;
}

function getVisibleTexts(xml) {
  const matches = xml.match(/text="([^"]+)"/g);
  return matches ? matches.map(m => m.replace(/text="|"/g, '')) : [];
}

module.exports = {
  sleep,
  runAdb,
  tap,
  typeText,
  swipe,
  dumpScreen,
  findElement,
  getVisibleTexts,
};
