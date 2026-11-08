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

/** VN = UTC+7, không có DST nên offset cố định này tương đương Asia/Ho_Chi_Minh. */
const VN_UTC_OFFSET_MINUTES = 7 * 60;

export type DateInput = string | Date | number | dayjs.Dayjs | undefined | null;

/**
 * Fallback cuối cùng, không phụ thuộc dayjs.tz / Intl: giờ VN tính tay từ
 * Date.now() + 7h rồi đọc bằng UTC getters. Chỉ dùng khi dayjs.tz trả về
 * invalid (Hermes thiếu Intl.DateTimeFormat.formatToParts cho timezone).
 */
function vnNowManual(): dayjs.Dayjs {
  const d = new Date(Date.now() + VN_UTC_OFFSET_MINUTES * 60 * 1000);
  return dayjs(
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:${String(
      d.getUTCMinutes(),
    ).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`,
  );
}

/**
 * Chuyển một giá trị dayjs đã tính qua dayjs.tz sang UTC+7 thủ công khi nó
 * invalid. Chuỗi naive ('YYYY-MM-DD', 'YYYY-MM-DD HH:mm') giữ nguyên giờ
 * tường (utcOffset(7, true)); chuỗi có offset/Z hoặc Date/timestamp giữ
 * nguyên thời điểm tuyệt đối (utcOffset(7)).
 */
function fallbackUtcOffset7(input: unknown): dayjs.Dayjs {
  if (
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?$/.test(input.trim())
  ) {
    const d = dayjs(input.trim()).utcOffset(VN_UTC_OFFSET_MINUTES, true);
    if (d.isValid()) return d;
  }
  if (input instanceof Date || typeof input === 'number' || dayjs.isDayjs(input)) {
    const d = dayjs(input as any).utcOffset(VN_UTC_OFFSET_MINUTES);
    if (d.isValid()) return d;
  }
  if (typeof input === 'string') {
    const d = dayjs(input).utcOffset(VN_UTC_OFFSET_MINUTES);
    if (d.isValid()) return d;
  }
  return vnNowManual();
}

/**
 * Chuyển mọi đầu vào ngày giờ về múi giờ Việt Nam.
 * - Chuỗi ISO có offset/Z, Date, timestamp, Dayjs: giữ nguyên thời điểm tuyệt
 *   đối, chỉ đổi múi giờ hiển thị sang VN.
 * - Chuỗi naive ('YYYY-MM-DD', 'YYYY-MM-DD HH:mm'): đọc như giờ tường VN.
 * - Rỗng: trả về thời điểm hiện tại theo giờ VN.
 * - Mảng (expo-router trả duplicate params dạng string[]): lấy phần tử đầu.
 * - Giá trị không phải string/Date/number/Dayjs: trả về giờ VN hiện tại.
 * BULLETPROOF (v9 date-picker blank): dayjs.tz() âm thầm trả invalid khi
 * runtime thiếu Intl timezone (Hermes trên LDPlayer/OPPO, không polyfill),
 * và .format() của invalid trả literal 'Invalid Date' — chuỗi này non-empty
 * nên lọt mọi check !date rồi bị API @IsDateString() từ chối. Vì vậy mọi
 * kết quả tz invalid đều fallback sang UTC+7 thủ công (VN không DST nên
 * tương đương), và hàm này KHÔNG BAO GIỜ trả về Dayjs invalid.
 */
export function toVnDayjs(dateInput: DateInput | unknown): dayjs.Dayjs {
  const input: unknown = Array.isArray(dateInput) ? dateInput[0] : dateInput;
  if (input === undefined || input === null || input === '') return vnNow();
  if (
    typeof input !== 'string' &&
    !(input instanceof Date) &&
    typeof input !== 'number' &&
    !dayjs.isDayjs(input)
  ) {
    return vnNow();
  }
  // Chuỗi ISO có Z hoặc offset số (+07:00, -05:00) là THỜI ĐIỂM TUYỆT ĐỐI
  // (server trả created_at dạng UTC '...Z'). dayjs.tz(str, tz) BỎ QUA Z và
  // đọc giờ tường như giờ VN → lệch đúng 7 tiếng (đơn tạo 18:54 hiện
  // '7 giờ trước'). Vì vậy parse tuyệt đối trước rồi mới chuyển sang VN.
  // Chuỗi naive ('YYYY-MM-DD', 'YYYY-MM-DD HH:mm') KHÔNG vào nhánh này —
  // vẫn đọc như giờ tường VN như cũ.
  if (typeof input === 'string' && /([Zz]|[+-]\d{2}:?\d{2})$/.test(input.trim())) {
    try {
      const absolute = dayjs(input.trim()).tz(VN_TIMEZONE);
      if (absolute.isValid()) return absolute;
    } catch {
      // rớt xuống fallbackUtcOffset7 bên dưới (giữ nguyên thời điểm tuyệt đối)
    }
    return fallbackUtcOffset7(input);
  }
  let result: dayjs.Dayjs;
  try {
    result = dayjs.tz(input as any, VN_TIMEZONE);
  } catch {
    return fallbackUtcOffset7(input);
  }
  if (result.isValid()) return result;
  return fallbackUtcOffset7(input);
}

/** Thời điểm hiện tại theo giờ Việt Nam — không bao giờ invalid (fallback UTC+7 tay). */
export function vnNow(): dayjs.Dayjs {
  let now: dayjs.Dayjs;
  try {
    now = dayjs().tz(VN_TIMEZONE);
  } catch {
    return vnNowManual();
  }
  return now.isValid() ? now : dayjs().utcOffset(VN_UTC_OFFSET_MINUTES);
}

/** Khóa ngày 'YYYY-MM-DD' của hôm nay (giờ VN) cộng thêm offsetDays ngày. Không bao giờ trả 'Invalid Date'. */
export function vnDateKey(offsetDays = 0): string {
  const d = vnNow().add(offsetDays, 'day');
  if (d.isValid()) {
    const key = d.format('YYYY-MM-DD');
    if (key && key !== 'Invalid Date') return key;
  }
  return vnNowManual().add(offsetDays, 'day').format('YYYY-MM-DD');
}

/** Khóa ngày-giờ 'YYYY-MM-DDT09:00:00' của hôm nay (giờ VN) cộng offsetDays. */
export function vnDateTimeKey(offsetDays = 0, time = '09:00'): string {
  return `${vnDateKey(offsetDays)}T${time}:00`;
}

/** 'YYYY-MM-DD' thật (đúng dạng + đúng ngày, vd 2026-02-30 là sai). */
export function isValidDateKey(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return false;
  const d = toVnDayjs(s);
  return d.isValid() && d.format('YYYY-MM-DD') === s;
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
export function formatDateTime(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid()
    ? lang === 'en'
      ? date.format('HH:mm MM/DD/YYYY')
      : date.format('HH:mm DD/MM/YYYY')
    : '';
}

export function formatDate(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const date = toVnDayjs(dateInput);
  return date.isValid()
    ? lang === 'en'
      ? date.format('MM/DD/YYYY')
      : date.format('DD/MM/YYYY')
    : '';
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

/** 'Thứ hai, 08/11/2026' / 'Monday, 11/08/2026' theo giờ VN. */
export function formatDateWithWeekday(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const weekday = formatWeekday(dateInput, lang);
  const date = formatDate(dateInput, lang);
  return weekday && date ? `${weekday}, ${date}` : '';
}

/** 'Thứ hai, 08/11/2026 09:00' / 'Monday, 11/08/2026 09:00' theo giờ VN. */
export function formatDateTimeWithWeekday(dateInput: DateInput, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateInput) return '';
  const weekday = formatWeekday(dateInput, lang);
  const dateTime = formatDateTime(dateInput, lang);
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
