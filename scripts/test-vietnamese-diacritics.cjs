const test = require('node:test');
const assert = require('node:assert/strict');

function removeVietnameseDiacritics(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

test('removeVietnameseDiacritics normalizes accented Vietnamese strings correctly', () => {
  assert.equal(removeVietnameseDiacritics('Vệ sinh máy lạnh'), 've sinh may lanh');
  assert.equal(removeVietnameseDiacritics('Sửa điện gia dụng'), 'sua dien gia dung');
  assert.equal(removeVietnameseDiacritics('Dọn nhà'), 'don nha');
  assert.equal(removeVietnameseDiacritics('Bốc hàng & Vận chuyển'), 'boc hang & van chuyen');
  assert.equal(removeVietnameseDiacritics('Sửa khóa cửa'), 'sua khoa cua');
});

test('Accent-insensitive search matching works for both accented and unaccented queries', () => {
  const services = [
    { name: 'Vệ sinh máy lạnh', slug: 've_sinh_may_lanh' },
    { name: 'Sửa điện gia dụng', slug: 'sua_dien' },
    { name: 'Dọn nhà', slug: 'don_dap_nha' },
    { name: 'Sửa khóa cửa', slug: 'sua_khoa' },
  ];

  function search(query) {
    const q = removeVietnameseDiacritics(query);
    if (!q) return services;
    return services.filter(s => {
      const normName = removeVietnameseDiacritics(s.name);
      const normSlug = removeVietnameseDiacritics(s.slug.replace(/_/g, ' '));
      return normName.includes(q) || normSlug.includes(q);
    });
  }

  // Test 1: Unaccented query matches accented name
  const r1 = search('may lanh');
  assert.equal(r1.length, 1);
  assert.equal(r1[0].name, 'Vệ sinh máy lạnh');

  // Test 2: Unaccented query for electricity
  const r2 = search('dien');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].name, 'Sửa điện gia dụng');

  // Test 3: Unaccented query for cleaning
  const r3 = search('don nha');
  assert.equal(r3.length, 1);
  assert.equal(r3[0].name, 'Dọn nhà');

  // Test 4: Accented query matches
  const r4 = search('máy lạnh');
  assert.equal(r4.length, 1);
  assert.equal(r4[0].name, 'Vệ sinh máy lạnh');

  // Test 5: Empty query returns all services
  assert.equal(search('').length, 4);

  // Test 6: Non-existent query returns empty
  assert.equal(search('khongcodichvunay').length, 0);
});
