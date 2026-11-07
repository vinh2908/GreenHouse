import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import 'dayjs/locale/en';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

/**
 * B29 — Múi giờ hiển thị chuẩn của toàn app: Việt Nam (UTC+7).
 * Mọi ngày giờ hiển thị đều đi qua các hàm trong file này để không còn
 * phụ thuộc múi giờ máy. Không dùng dayjs(...).format(...) thô ở ngoài.
 */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

export type DateInput = string | Date | number | dayjs.Dayjs | undefined | null;

/**
 * Chuyển mọi đầu vào ngày giờ về múi giờ Việt Nam.
 * - Chuỗi ISO có offset/Z, Date, timestamp, Dayjs: giữ nguyên thời điểm tuyệt
 *   đối, chỉ đổi múi giờ hiển thị sang VN.
 * - Chuỗi naive ('YYYY-MM-DD', 'YYYY-MM-DD HH:mm'): đọc như giờ tường VN.
 * - Rỗng: trả về thời điểm hiện tại theo giờ VN.
 */
export function toVnDayjs(dateInput: DateInput): dayjs.Dayjs {
  if (!dateInput) return dayjs().tz(VN_TIMEZONE);
  return dayjs.tz(dateInput, VN_TIMEZONE);
}

/** Thời điểm hiện tại theo giờ Việt Nam. */
export function vnNow(): dayjs.Dayjs {
  return dayjs().tz(VN_TIMEZONE);
}

/** Khóa ngày 'YYYY-MM-DD' của hôm nay (giờ VN) cộng thêm offsetDays ngày. */
export function vnDateKey(offsetDays = 0): string {
  return vnNow().add(offsetDays, 'day').format('YYYY-MM-DD');
}

/** Khóa ngày-giờ 'YYYY-MM-DDT09:00:00' của hôm nay (giờ VN) cộng offsetDays. */
export function vnDateTimeKey(offsetDays = 0, time = '09:00'): string {
  return `${vnDateKey(offsetDays)}T${time}:00`;
}

/** Khóa ngày 'YYYY-MM-DD' của một thời điểm, tính theo giờ VN. */
export function formatDateKey(dateInput: DateInput): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid() ? date.format('YYYY-MM-DD') : '';
}

/** Khóa tháng 'YYYY-MM' của một thời điểm, tính theo giờ VN. */
export function formatMonthKey(dateInput: DateInput): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid() ? date.format('YYYY-MM') : '';
}

/** 'MM/YYYY' của một thời điểm, tính theo giờ VN. */
export function formatMonthSlash(dateInput: DateInput): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid() ? date.format('MM/YYYY') : '';
}

/**
 * Định dạng thời gian tin nhắn cuối trong danh sách Tin nhắn:
 * - Hôm nay: HH:mm
 * - Hôm qua: 'Hôm qua'
 * - Cũ hơn trong cùng năm: DD/MM
 * - Năm trước: DD/MM/YYYY
 * Ngày "hôm nay / hôm qua" tính theo giờ Việt Nam.
 */
/**
 * Nhãn dải phân cách ngày trong chat (B21), dùng chung logic ngày với
 * formatConversationTime: Hôm nay / Hôm qua / DD/MM / DD/MM/YYYY.
 */
export function formatDayLabel(
  dateInput: DateInput,
  nowInput?: dayjs.Dayjs,
  lang: 'vi' | 'en' = 'vi',
): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  if (!date.isValid()) return '';
  const now = nowInput ? toVnDayjs(nowInput) : vnNow();
  if (date.isSame(now, 'day')) return lang === 'en' ? 'Today' : 'Hôm nay';
  if (date.isSame(now.subtract(1, 'day'), 'day')) return lang === 'en' ? 'Yesterday' : 'Hôm qua';
  if (date.isSame(now, 'year')) return date.format('DD/MM');
  return date.format('DD/MM/YYYY');
}

export function formatConversationTime(
  dateInput: DateInput,
  nowInput?: dayjs.Dayjs,
  lang: 'vi' | 'en' = 'vi',
): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  if (!date.isValid()) return '';
  const now = nowInput ? toVnDayjs(nowInput) : vnNow();

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

/**
 * B29 — chuẩn hiển thị ngày giờ dùng chung cho toàn app (giờ Việt Nam):
 * - formatDateTime: thời điểm cụ thể -> 'HH:mm DD/MM/YYYY'
 * - formatDate: ngày -> 'DD/MM/YYYY'
 * - formatTime: giờ -> 'HH:mm'
 * Giá trị không hợp lệ trả về '' (không ném lỗi, không hiện Invalid Date).
 */
export function formatDateTime(dateInput: DateInput): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid() ? date.format('HH:mm DD/MM/YYYY') : '';
}

export function formatDate(dateInput: DateInput): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid() ? date.format('DD/MM/YYYY') : '';
}

export function formatTime(dateInput: DateInput): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid() ? date.format('HH:mm') : '';
}

/**
 * G13 — thời gian tương đối dùng chung ('5 phút trước' / '5 minutes ago'):
 * tính theo giờ Việt Nam (Asia/Ho_Chi_Minh, qua toVnDayjs) và ngôn ngữ đã
 * chọn. Đây là chỗ DUY NHẤT trong mobile được gọi .fromNow() — các màn
 * hình không tự gọi dayjs(...).fromNow() nữa. Giá trị không hợp lệ → ''.
 */
export function formatRelativeTime(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  if (!date.isValid()) return '';
  return date.locale(lang).fromNow();
}

/** Tên thứ trong tuần, viết hoa chữ đầu, đúng ngôn ngữ đã chọn, theo giờ VN. */
export function formatWeekday(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  if (!date.isValid()) return '';
  const dow = date.locale(lang).format('dddd');
  return dow.charAt(0).toUpperCase() + dow.slice(1);
}

/** 'Thứ hai, 08/11/2026' / 'Monday, 08/11/2026' theo giờ VN. */
export function formatDateWithWeekday(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const weekday = formatWeekday(dateInput, lang);
  const date = formatDate(dateInput);
  return weekday && date ? `${weekday}, ${date}` : '';
}

/** 'Thứ hai, 08/11/2026 09:00' / 'Monday, 08/11/2026 09:00' theo giờ VN. */
export function formatDateTimeWithWeekday(
  dateInput: DateInput,
  lang: 'vi' | 'en' = 'vi',
): string {
  if (!dateInput) return '';
  const weekday = formatWeekday(dateInput, lang);
  const dateTime = formatDateTime(dateInput);
  return weekday && dateTime ? `${weekday}, ${dateTime}` : '';
}

/** 'T2, 08/11' / 'Mon, 08/11' theo giờ VN. */
export function formatShortDay(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  if (!date.isValid()) return '';
  const short = date.locale(lang).format('ddd');
  const capShort = short.charAt(0).toUpperCase() + short.slice(1);
  return `${capShort}, ${date.format('DD/MM')}`;
}

/** Tiêu đề tháng của lịch: 'Tháng 11 · 2026' / 'November 2026' theo giờ VN. */
export function formatMonthTitle(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  if (!date.isValid()) return '';
  return lang === 'en' ? date.locale('en').format('MMMM YYYY') : `Tháng ${date.format('M · YYYY')}`;
}
