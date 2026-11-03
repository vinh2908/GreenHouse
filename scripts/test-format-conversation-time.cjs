const test = require('node:test');
const assert = require('node:assert');
const dayjs = require('dayjs');

// Simple JS mirror or load compiled/transpiled
function formatConversationTime(dateInput, nowInput) {
  if (!dateInput) return '';
  const date = dayjs(dateInput);
  if (!date.isValid()) return '';
  const now = nowInput ? dayjs(nowInput) : dayjs();

  if (date.isSame(now, 'day')) {
    return date.format('HH:mm');
  }

  const yesterday = now.subtract(1, 'day');
  if (date.isSame(yesterday, 'day')) {
    return 'Hôm qua';
  }

  if (date.isSame(now, 'year')) {
    return date.format('DD/MM');
  }

  return date.format('DD/MM/YYYY');
}

test('formatConversationTime: HÔM NAY -> HH:mm', () => {
  const now = dayjs('2026-11-03T10:00:00');
  const msgTime = dayjs('2026-11-03T08:30:00');
  assert.strictEqual(formatConversationTime(msgTime, now), '08:30');
});

test('formatConversationTime: HÔM QUA -> Hôm qua', () => {
  const now = dayjs('2026-11-03T10:00:00');
  const msgTime = dayjs('2026-11-02T16:48:00');
  assert.strictEqual(formatConversationTime(msgTime, now), 'Hôm qua');
});

test('formatConversationTime: Cũ hơn cùng năm -> DD/MM', () => {
  const now = dayjs('2026-11-03T10:00:00');
  const msgTime = dayjs('2026-10-25T14:20:00');
  assert.strictEqual(formatConversationTime(msgTime, now), '25/10');
});

test('formatConversationTime: Năm trước -> DD/MM/YYYY', () => {
  const now = dayjs('2026-11-03T10:00:00');
  const msgTime = dayjs('2025-12-15T09:15:00');
  assert.strictEqual(formatConversationTime(msgTime, now), '15/12/2025');
});

test('formatConversationTime: null/undefined/invalid -> empty string', () => {
  assert.strictEqual(formatConversationTime(null), '');
  assert.strictEqual(formatConversationTime(undefined), '');
  assert.strictEqual(formatConversationTime('invalid-date'), '');
});
