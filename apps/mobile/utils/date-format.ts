import dayjs from 'dayjs';

/**
 * Định dạng thời gian tin nhắn cuối trong danh sách Tin nhắn:
 * - Hôm nay: HH:mm
 * - Hôm qua: 'Hôm qua'
 * - Cũ hơn trong cùng năm: DD/MM
 * - Năm trước: DD/MM/YYYY
 */
export function formatConversationTime(
  dateInput: string | Date | number | dayjs.Dayjs | undefined | null,
  nowInput?: dayjs.Dayjs,
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
    return 'Hôm qua';
  }

  if (date.isSame(now, 'year')) {
    return date.format('DD/MM');
  }

  return date.format('DD/MM/YYYY');
}
