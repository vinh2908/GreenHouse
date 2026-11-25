import fs from 'fs';
import path from 'path';

 
const prefillMod = require('../../../mobile/utils/service-prefill');

/**
 * R22 — Kiểm chứng phía mobile cho các mục 1, 3, 5:
 *  - Mục 1: nút "Hủy nhận đơn" trên helper-job-detail kích hoạt sheet SOS Backup
 *    cho đơn đã chốt, không mở modal hủy trực tiếp.
 *  - Mục 3: SosBackupCustomerBanner hiển thị trạng thái pending trực tiếp
 *    (số thợ đã mời, đợt mời, đếm ngược, giải thích khi chưa có thợ) và
 *    SosCustomerDecisionPopup phản hồi rõ sau khi bấm.
 *  - Mục 5: buildServicePrefill trả về tiêu đề + mô tả đúng cho đủ 12 dịch vụ,
 *    3 dịch vụ chỉ có trên màn dịch vụ (Vệ sinh máy lạnh, Chuyển nhà, Bốc hàng)
 *    và dịch vụ tùy chỉnh; services.tsx + home.tsx truyền prefill_title/prefill_description.
 */
describe('Mobile R22 audits (items 1, 3, 5)', () => {
  const mobileRoot = path.resolve(__dirname, '../../../mobile');

  it('Mục 1: helper-job-detail mở SosBackupHelperCard khi hủy đơn đã chốt', () => {
    const detailSrc = fs.readFileSync(
      path.join(mobileRoot, 'app/helper-job-detail/[id].tsx'),
      'utf8',
    );
    expect(detailSrc).toContain('setSosOpenSignal');
    expect(detailSrc).toContain('<SosBackupHelperCard job={job} openSignal={sosOpenSignal}');

    const cardSrc = fs.readFileSync(
      path.join(mobileRoot, 'components/common/sos-backup-helper-card.tsx'),
      'utf8',
    );
    expect(cardSrc).toContain('openSignal');
    expect(cardSrc).toContain('setSheetOpen(true)');
  });

  it('Mục 3: SosBackupCustomerBanner có trạng thái pending trực tiếp & popup phản hồi rõ', () => {
    const bannerSrc = fs.readFileSync(
      path.join(mobileRoot, 'components/common/sos-backup-customer-banner.tsx'),
      'utf8',
    );
    expect(bannerSrc).toContain('Đã đồng ý đổi người — đang tìm thợ thay thế');
    expect(bannerSrc).toContain('Đợt mời:');
    expect(bannerSrc).toContain('Số thợ đã mời:');
    expect(bannerSrc).toContain('formatCountdown');
    expect(bannerSrc).toContain('Hiện không có thợ nào đang online gần bạn');

    const popupSrc = fs.readFileSync(
      path.join(mobileRoot, 'components/common/sos-customer-decision-popup.tsx'),
      'utf8',
    );
    expect(popupSrc).toContain('submittedChoice');
    expect(popupSrc).toContain('Đã ghi nhận đồng ý đổi người');
  });

  it('Mục 5: buildServicePrefill điền đúng tiêu đề + mô tả cho đủ 12 slug & 3 dịch vụ riêng', () => {
    const slugs = [
      'housekeeping_hourly',
      'deep_cleaning',
      'cooking',
      'laundry',
      'caregiving',
      'pet_care',
      'electrician',
      'plumber',
      'ac_repair',
      'moving_help',
      'handyman',
      'custom',
    ];

    for (const slug of slugs) {
      const res = prefillMod.buildServicePrefill({ slug });
      expect(res.title.trim().length).toBeGreaterThanOrEqual(5);
      expect(res.description.trim().length).toBeGreaterThanOrEqual(40);
    }

    // 3 dịch vụ chỉ có trên màn dịch vụ (truyền qua tên tùy chỉnh không có API description)
    for (const name of ['Vệ sinh máy lạnh', 'Chuyển nhà', 'Bốc hàng, vận chuyển']) {
      const res = prefillMod.buildServicePrefill({ customServiceName: name });
      expect(res.title).toBe(name);
      expect(res.description).not.toContain('Yêu cầu công việc riêng');
      expect(res.description.length).toBeGreaterThan(60);
    }

    // Dùng trường description của API khi có
    const withApi = prefillMod.buildServicePrefill({
      slug: 'cooking',
      name: 'Nấu ăn gia đình',
      apiDescription: 'Đi chợ và nấu bữa cơm 4 món từ API.',
    });
    expect(withApi.title).toBe('Nấu ăn gia đình');
    expect(withApi.description).toBe('Đi chợ và nấu bữa cơm 4 món từ API.');

    // Dịch vụ tùy chỉnh ngoài danh mục vẫn giữ tên + mẫu chung
    const custom = prefillMod.buildServicePrefill({ customServiceName: 'Lau kính mặt ngoài' });
    expect(custom.title).toBe('Lau kính mặt ngoài');
    expect(custom.description).toContain('Lau kính mặt ngoài');
  });

  it('Mục 5: services.tsx và home.tsx đều gọi buildServicePrefill khi mở booking', () => {
    const servicesSrc = fs.readFileSync(
      path.join(mobileRoot, 'app/(customer)/services.tsx'),
      'utf8',
    );
    const homeSrc = fs.readFileSync(path.join(mobileRoot, 'app/(customer)/home.tsx'), 'utf8');
    const bookingSrc = fs.readFileSync(path.join(mobileRoot, 'app/(customer)/booking.tsx'), 'utf8');

    expect(servicesSrc).toContain('buildServicePrefill');
    expect(servicesSrc).toContain('prefill_title');
    expect(servicesSrc).toContain('prefill_description');

    expect(homeSrc).toContain('buildServicePrefill');
    expect(homeSrc).toContain('prefill_description: prefill.description');

    expect(bookingSrc).toContain('params.prefill_title');
    expect(bookingSrc).toContain('params.prefill_description');
  });
});
