// utils/monthly-contract-city.ts — R11 (H1): thành phố cho hợp đồng tháng.
//
// KHÔNG mặc định/không fallback 'Hồ Chí Minh' (hay 'Ho Chi Minh') ở bất
// cứ chỗ nào: khách ở Đà Nẵng từng bị gán địa chỉ Hồ Chí Minh vì mặc định
// này. Thành phố chỉ đến từ 2 nguồn thật:
//   - địa chỉ đã lưu được chọn (city của địa chỉ đó, trim), hoặc
//   - người dùng nhập tay (trim); rỗng thì trả '' để bước validate chặn
//     lại — không tự điền thành phố nào.
// Review R11: địa chỉ đã lưu có city trống/chỉ khoảng trắng thì rơi về ô
// nhập tay (không trả '' câm khi người dùng đã nhập thành phố khác).
export function resolveMonthlyContractCity(
  selectedAddressCity: string | undefined | null,
  typedCity: string,
): string {
  const saved = (selectedAddressCity ?? '').trim();
  if (saved !== '') return saved;
  return (typedCity ?? '').trim();
}
