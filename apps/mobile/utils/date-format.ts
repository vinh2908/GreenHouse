import dayjs from 'dayjs';

/**
 * Định dạng thời gian tin nhắn cuối trong danh sách Tin nhắn:
 * - Hôm nay: HH:mm
 * - Hôm qua: 'Hôm qua'
 * - Cũ hơn trong cùng năm: DD/MM
 * - Năm trước: DD/MM/YYYY
 */
/**
 * Nhãn dải phân cách ngày trong chat (B21), dùng chung logic ngày với
 * formatConversationTime: Hôm nay / Hôm qua / DD/MM / DD/MM/YYYY.
 */
export function formatDayLabel(
  dateInput: string | Date | number | dayjs.Dayjs | undefined | null,
  nowInput?: dayjs.Dayjs,
  lang: 'vi' | 'en' = 'vi',
): string {
  if (!dateInput) return '';
  const date = dayjs(dateInput);
  if (!date.isValid()) return '';
  const now = nowInput ?? dayjs();
  if (date.isSame(now, 'day')) return lang === 'en' ? 'Today' : 'Hôm nay';
  if (date.isSame(now.subtract(1, 'day'), 'day')) return lang === 'en' ? 'Yesterday' : 'Hôm qua';
  if (date.isSame(now, 'year')) return date.format('DD/MM');
  return date.format('DD/MM/YYYY');
}

export function formatConversationTime(
  dateInput: string | Date | number | dayjs.Dayjs | undefined | null,
  nowInput?: dayjs.Dayjs,
  lang: 'vi' | 'en' = 'vi',
): string {
  if (!dateInput) return '';
  const date = dayjs(dateInput);
  if (!date.isValid()) return '';
  const now = nowInput ?? dayjs();

  if (date.isSame(now, 'day')) {
    return date.format('HH:mm');
  }

  const yesterday = now.subtract(1, 'day');
  if (date.isSame(yesterday, 'day')) {
    return lang === 'en' ? 'Yesterday' : 'Hôm qua';
  }

  if (date.isSame(now, 'year')) {
    return date.format('DD/MM');
  }

  return date.format('DD/MM/YYYY');
}
