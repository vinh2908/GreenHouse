const test = require('node:test');
const assert = require('node:assert/strict');
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
require('dayjs/locale/vi');
require('dayjs/locale/en');

dayjs.extend(relativeTime);

// Test dayjs locale switching
test('dayjs switches cleanly between vi and en relative time', () => {
  dayjs.locale('vi');
  const viText = dayjs().subtract(1, 'day').fromNow();
  assert.match(viText, /trước|hôm qua/i, `Expected Vietnamese relative time, got: ${viText}`);

  dayjs.locale('en');
  const enText = dayjs().subtract(1, 'day').fromNow();
  assert.match(enText, /ago|yesterday/i, `Expected English relative time, got: ${enText}`);

  // Also test instance-level .locale(lang)
  const past = dayjs().subtract(2, 'day');
  assert.match(past.locale('vi').fromNow(), /2 ngày trước/i);
  assert.match(past.locale('en').fromNow(), /2 days ago/i);
});

// Import service translations map from i18n
const { SERVICE_NAME_EN_MAP, SERVICE_SLUG_EN_MAP } = (() => {
  const fs = require('fs');
  const content = fs.readFileSync('apps/mobile/services/i18n.ts', 'utf8');

  // Extract SERVICE_NAME_EN_MAP
  const nameMapMatch = content.match(
    /export const SERVICE_NAME_EN_MAP: Record<string, string> = ({[\s\S]*?});/,
  );
  // Extract SERVICE_SLUG_EN_MAP
  const slugMapMatch = content.match(
    /export const SERVICE_SLUG_EN_MAP: Record<string, string> = ({[\s\S]*?});/,
  );

  return {
    SERVICE_NAME_EN_MAP: eval('(' + nameMapMatch[1] + ')'),
    SERVICE_SLUG_EN_MAP: eval('(' + slugMapMatch[1] + ')'),
  };
})();

function translateServiceName(service, lang) {
  if (!service) return '';
  const rawName = typeof service === 'string' ? service : service.name || service.title || '';
  const slug = typeof service === 'object' && service ? service.slug : undefined;

  if (lang !== 'en') {
    return rawName || (slug ? SERVICE_SLUG_EN_MAP[slug] || slug : '');
  }

  if (slug && SERVICE_SLUG_EN_MAP[slug]) {
    return SERVICE_SLUG_EN_MAP[slug];
  }

  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();
  if (SERVICE_NAME_EN_MAP[lower]) {
    return SERVICE_NAME_EN_MAP[lower];
  }

  return rawName;
}

test('translateServiceName maps Pet care correctly', () => {
  assert.equal(translateServiceName('Chăm sóc thú cưng', 'en'), 'Pet care');
  assert.equal(translateServiceName('Chăm sóc thú cưng', 'vi'), 'Chăm sóc thú cưng');
  assert.equal(
    translateServiceName({ name: 'Chăm sóc thú cưng', slug: 'pet_care' }, 'en'),
    'Pet care',
  );
});

test('translateServiceName maps standard catalog services', () => {
  assert.equal(translateServiceName('Giúp việc theo giờ', 'en'), 'Hourly housekeeping');
  assert.equal(translateServiceName('Dọn nhà', 'en'), 'House cleaning');
  assert.equal(translateServiceName('Vệ sinh máy lạnh', 'en'), 'AC cleaning');
  assert.equal(translateServiceName('Sửa điện gia dụng', 'en'), 'Home electrician');
  assert.equal(translateServiceName('Sửa ống nước', 'en'), 'Plumbing repair');
  assert.equal(translateServiceName('Nấu ăn gia đình', 'en'), 'Home cooking');
  assert.equal(translateServiceName('Bốc hàng, vận chuyển', 'en'), 'Cargo & logistics');
});

test('translateServiceName preserves out-of-catalog names as-is', () => {
  const custom = 'Sửa chữa giàn phơi thông minh';
  assert.equal(translateServiceName(custom, 'en'), custom);
  assert.equal(translateServiceName(custom, 'vi'), custom);
});
