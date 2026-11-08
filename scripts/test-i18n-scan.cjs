const fs = require('fs');
const path = require('path');

function getStringsKeys() {
  const i18nPath = path.resolve(__dirname, '../apps/mobile/services/i18n.ts');
  const i18nContent = fs.readFileSync(i18nPath, 'utf8');

  // Match keys in STRINGS = { key: { vi: ..., en: ... } }
  const stringsBlockMatch = i18nContent.match(/export const STRINGS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!stringsBlockMatch) {
    throw new Error('Could not find STRINGS in apps/mobile/services/i18n.ts');
  }

  const stringsKeys = new Set();
  const keyRegex = /^\s*([a-zA-Z0-9_]+)\s*:\s*\{/gm;
  let m;
  while ((m = keyRegex.exec(stringsBlockMatch[1])) !== null) {
    stringsKeys.add(m[1]);
  }
  return stringsKeys;
}

function scanMobileFilesForI18nKeys() {
  const mobileDir = path.resolve(__dirname, '../apps/mobile');
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.expo', 'dist', '.next'].includes(entry.name)) {
          walk(full);
        }
      } else if (/\.(tsx|ts)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }

  walk(mobileDir);

  const stringsKeys = getStringsKeys();
  const missing = new Map();
  // Regex to match t('some_key') or t("some_key")
  const tCallRegex = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = tCallRegex.exec(content)) !== null) {
      const key = match[1];
      if (!stringsKeys.has(key)) {
        if (!missing.has(key)) missing.set(key, []);
        missing.get(key).push(path.relative(path.resolve(__dirname, '..'), file));
      }
    }
  }

  return { stringsKeys, missing };
}

if (require.main === module) {
  const { stringsKeys, missing } = scanMobileFilesForI18nKeys();
  console.log(`Found ${stringsKeys.size} keys defined in STRINGS.`);
  if (missing.size > 0) {
    console.error(`ERROR: Found ${missing.size} missing i18n key(s) in apps/mobile:`);
    for (const [k, flist] of missing) {
      console.error(`  - Key "${k}" missing in STRINGS (used in: ${flist.join(', ')})`);
    }
    process.exit(1);
  } else {
    console.log('PASS: All t() keys used across apps/mobile exist in STRINGS.');
  }
}

module.exports = { getStringsKeys, scanMobileFilesForI18nKeys };
