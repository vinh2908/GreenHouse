// utils/service-prefill.ts — Nội dung tiêu đề & mô tả mẫu cho từng dịch vụ
// khi mở wizard Đặt việc từ trang chủ hoặc màn "Tất cả dịch vụ".
// Ưu tiên lấy `description` từ API nếu có; khi không có (hoặc với 3 dịch vụ
// chỉ có ở màn dịch vụ / dịch vụ tùy chỉnh) dùng bảng mẫu tiếng Việt dưới đây.

export interface ServicePrefillTemplate {
  title: string;
  description: string;
}

const SLUG_TEMPLATES: Record<string, ServicePrefillTemplate> = {
  housekeeping_hourly: {
    title: 'Giúp việc theo giờ',
    description:
      'Cần hỗ trợ dọn dẹp phòng khách, phòng ngủ, khu vực bếp và nhà vệ sinh. Công việc gồm quét lau sàn, lau bụi bề mặt, sắp xếp đồ đạc gọn gàng và rửa chén bát cơ bản. Sẽ trao đổi thêm chi tiết khu vực ưu tiên khi bắt đầu.',
  },
  deep_cleaning: {
    title: 'Tổng vệ sinh nhà cửa',
    description:
      'Cần tổng vệ sinh toàn bộ không gian nhà ở hoặc căn hộ chuyên sâu. Bao gồm hút bụi, chà rửa sàn nhà, lau kính cửa sổ, làm sạch kỹ khu vực bếp, tủ kệ và nhà tắm. Mong muốn thợ làm kỹ các góc khuất và vết bẩn lâu ngày.',
  },
  cooking: {
    title: 'Nấu ăn gia đình',
    description:
      'Cần người hỗ trợ đi chợ hoặc sơ chế nguyên liệu có sẵn tại nhà và nấu bữa cơm gia đình theo khẩu vị. Sau khi nấu xong, dọn dẹp gọn gàng khu vực bếp và rửa sạch dụng cụ nấu nướng. Sẽ thống nhất thực đơn cụ thể trước khi làm.',
  },
  laundry: {
    title: 'Giặt ủi quần áo',
    description:
      'Cần hỗ trợ phân loại quần áo, giặt máy hoặc giặt tay đồ dễ hỏng và phơi phóng đúng cách. Sau khi đồ khô sẽ thu gom, gấp gọn gàng và ủi phẳng trang phục đi làm hoặc mặc hằng ngày. Lưu ý kiểm tra kỹ nhãn chất liệu vải trước khi giặt ủi.',
  },
  caregiving: {
    title: 'Chăm sóc người già & Trẻ nhỏ',
    description:
      'Cần người hỗ trợ trông nom, bầu bạn và chăm sóc sinh hoạt hằng ngày cho người lớn tuổi hoặc trẻ nhỏ tại nhà. Bao gồm hỗ trợ ăn uống đúng giờ, nhắc nhở uống thuốc theo hướng dẫn của gia đình và giữ môi trường xung quanh sạch sẽ. Ưu tiên người kiên nhẫn và chu đáo.',
  },
  pet_care: {
    title: 'Chăm sóc thú cưng',
    description:
      'Cần người hỗ trợ chăm sóc thú cưng tại nhà gồm cho ăn uống đúng bữa, thay nước sạch và dắt đi dạo đúng giờ. Kết hợp dọn khay cát hoặc vệ sinh khu vực chuồng trại và chải lông nhẹ nhàng nếu cần. Vui lòng cập nhật tình hình bé khi hoàn tất.',
  },
  electrician: {
    title: 'Sửa điện gia dụng',
    description:
      'Cần thợ điện kiểm tra sự cố chập điện, nhảy aptomat (CB) hoặc mất điện cục bộ trong nhà. Hỗ trợ sửa chữa, thay thế công tắc, ổ cắm, lắp đặt đèn chiếu sáng và kiểm tra đường dây thiết bị gia dụng. Yêu cầu kiểm tra an toàn điện kỹ trước khi bàn giao.',
  },
  plumber: {
    title: 'Sửa ống nước',
    description:
      'Cần thợ kiểm tra và xử lý tình trạng rò rỉ vòi nước, đường ống cấp thoát nước hoặc chậu rửa bị nghẹt. Bao gồm thay van khóa, bộ xả bồn cầu, xi-phông và thông tắc đường ống sinh hoạt. Mong muốn thợ mang đầy đủ dụng cụ sửa chữa cơ bản.',
  },
  ac_repair: {
    title: 'Vệ sinh máy lạnh',
    description:
      'Cần thợ vệ sinh lưới lọc, xịt rửa dàn lạnh, dàn nóng và thông đường ống thoát nước máy lạnh. Kết hợp kiểm tra độ lạnh, tiếng ồn và tình trạng gas nếu máy làm mát kém. Vui lòng che chắn cẩn thận khu vực xung quanh để giữ phòng sạch sẽ.',
  },
  moving_help: {
    title: 'Chuyển nhà',
    description:
      'Cần người hỗ trợ phân loại, đóng gói đồ đạc gia đình và khuân vác lên xuống xe khi chuyển nhà. Bao gồm hỗ trợ tháo lắp cơ bản các món nội thất gọn nhẹ và sắp xếp đồ vào đúng phòng tại nơi ở mới. Cần thực hiện cẩn thận với đồ dễ vỡ.',
  },
  handyman: {
    title: 'Bốc hàng, vận chuyển',
    description:
      'Cần người phụ bốc xếp hàng hóa, di dời đồ đạc nặng hoặc vận chuyển vật dụng theo yêu cầu. Hỗ trợ khuân vác, sắp xếp gọn gàng tại kho bãi, cửa hàng hoặc nhà riêng và phụ lắp đặt vặt nếu phát sinh. Sẽ trao đổi khối lượng đồ cụ thể trước khi bắt đầu.',
  },
  custom: {
    title: 'Yêu cầu dịch vụ khác',
    description:
      'Cần tìm người hỗ trợ công việc theo yêu cầu riêng tại nhà hoặc địa điểm chỉ định. Vui lòng xem kỹ nội dung công việc cụ thể, thời gian mong muốn và trao đổi trực tiếp nếu cần làm rõ thêm trước khi báo giá.',
  },
};

// Map bổ sung các slug cũ để luôn khớp khi API trả về alias
const SLUG_ALIASES: Record<string, string> = {
  plumbing: 'plumber',
  house_cleaning: 'deep_cleaning',
  hourly_helper: 'housekeeping_hourly',
  family_care: 'caregiving',
  petcare: 'pet_care',
};

const NAME_PATTERNS: { match: string[]; slug: string }[] = [
  { match: ['vệ sinh máy lạnh', 'máy lạnh', 'điều hòa'], slug: 'ac_repair' },
  { match: ['chuyển nhà'], slug: 'moving_help' },
  { match: ['bốc hàng', 'vận chuyển', 'bốc xếp'], slug: 'handyman' },
  { match: ['giúp việc'], slug: 'housekeeping_hourly' },
  { match: ['tổng vệ sinh', 'dọn nhà'], slug: 'deep_cleaning' },
  { match: ['nấu ăn'], slug: 'cooking' },
  { match: ['giặt ủi', 'giặt'], slug: 'laundry' },
  { match: ['người già', 'trẻ nhỏ', 'chăm sóc người'], slug: 'caregiving' },
  { match: ['thú cưng'], slug: 'pet_care' },
  { match: ['sửa điện', 'điện'], slug: 'electrician' },
  { match: ['ống nước', 'sửa nước'], slug: 'plumber' },
];

function resolveCanonicalSlug(slug?: string, name?: string): string {
  if (slug) {
    const clean = slug.trim().toLowerCase();
    const mapped = SLUG_ALIASES[clean] ?? clean;
    if (SLUG_TEMPLATES[mapped]) return mapped;
  }
  if (name) {
    const lower = name.trim().toLowerCase();
    for (const entry of NAME_PATTERNS) {
      if (entry.match.some(kw => lower.includes(kw))) {
        return entry.slug;
      }
    }
  }
  return 'custom';
}

/**
 * Tạo prefill tiêu đề & mô tả cho wizard Đăng việc.
 * - Dùng `apiDescription` (trường description của dịch vụ trên API) khi có.
 * - Khi API không có (hoặc với 3 dịch vụ chỉ có trên màn dịch vụ / tùy chỉnh)
 *   thì dùng bảng mẫu tiếng Việt theo slug chuẩn hoặc tên dịch vụ.
 */
export function buildServicePrefill(input: {
  slug?: string;
  name?: string;
  apiDescription?: string;
  customServiceName?: string;
}): ServicePrefillTemplate {
  const canonical = resolveCanonicalSlug(input.slug, input.customServiceName || input.name);
  const template = SLUG_TEMPLATES[canonical] ?? SLUG_TEMPLATES.custom;

  const customName = input.customServiceName?.trim();
  const displayName = input.name?.trim();
  const apiDesc = input.apiDescription?.trim();

  // Nếu là dịch vụ tùy chỉnh thực sự không khớp bất kỳ mẫu chuyên biệt nào (vd: "Lau kính ngoài trời")
  if (canonical === 'custom' && customName) {
    return {
      title: customName,
      description:
        apiDesc ||
        `Cần tìm người hỗ trợ thực hiện công việc "${customName}" tại địa chỉ đã chọn. Vui lòng chuẩn bị dụng cụ cần thiết nếu có và trao đổi thêm yêu cầu chi tiết trước khi bắt đầu.`,
    };
  }

  return {
    title: customName || displayName || template.title,
    description: apiDesc || template.description,
  };
}
