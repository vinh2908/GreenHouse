const fs = require('fs');
const path = require('path');

const i18nContent = fs.readFileSync(path.resolve(__dirname, '../apps/mobile/services/i18n.ts'), 'utf8');

// Match SERVER_ERROR_EN_MAP
const mapMatch = i18nContent.match(/const SERVER_ERROR_EN_MAP[\s\S]*?\n\};/);
// Match mapServerErrorMessage function
const fnMatch = i18nContent.match(/export function mapServerErrorMessage\([\s\S]*?\n\}/);

if (!mapMatch || !fnMatch) {
  console.error('Cannot find SERVER_ERROR_EN_MAP or mapServerErrorMessage in i18n.ts');
  process.exit(1);
}

const cleanedMap = mapMatch[0].replace(/: Record<string, string>/, '');
const cleanedFn = fnMatch[0]
  .replace('export function mapServerErrorMessage(rawMessage: unknown, lang: AppLanguage = \'vi\'): string', 'function mapServerErrorMessage(rawMessage, lang = "vi")');

const scriptCode = `
${cleanedMap}
${cleanedFn}
return mapServerErrorMessage;
`;

const mapServerErrorMessage = new Function(scriptCode)();

console.log('Testing G6: mapServerErrorMessage');

// 1. Fallback unmapped to "Something went wrong, please try again" in English mode
const unmapped = 'Lỗi hệ thống bất định chưa từng định nghĩa';
if (mapServerErrorMessage(unmapped, 'en') !== 'Something went wrong, please try again') {
  console.error('FAIL: unmapped message did not fallback to "Something went wrong, please try again"');
  process.exit(1);
}
if (mapServerErrorMessage(unmapped, 'vi') !== unmapped) {
  console.error('FAIL: unmapped message modified in Vietnamese mode');
  process.exit(1);
}

// 2. Dynamic withdrawal min amount extraction
if (mapServerErrorMessage('Số tiền rút tối thiểu là 100.000₫', 'en') !== 'Minimum withdrawal amount is 100.000₫') {
  console.error('FAIL: dynamic 100.000₫ withdrawal amount not extracted');
  process.exit(1);
}
if (mapServerErrorMessage('Số tiền rút tối thiểu là 200,000 VND', 'en') !== 'Minimum withdrawal amount is 200,000 VND') {
  console.error('FAIL: dynamic 200,000 VND withdrawal amount not extracted');
  process.exit(1);
}

console.log('PASS: G6 mapServerErrorMessage passed all assertions.');
