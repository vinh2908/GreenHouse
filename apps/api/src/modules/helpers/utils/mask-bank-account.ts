/**
 * G4 (F8): che số tài khoản ngân hàng của thợ trước khi trả về cho client.
 * Hàm dùng chung cho HelpersService (getProfile/updateProfile/setStatus/
 * submitKyc/updateBankAccount/approveKyc/rejectKyc) và AdminService
 * (approveKyc/rejectKyc — route admin duyệt e-KYC mới là route live; hai
 * hàm cùng tên trong HelpersService không có route expose nhưng vẫn phải
 * che để không rò rỉ nếu sau này được dùng). Số TK đầy đủ không bao giờ
 * được trả về: chỉ giữ 4 số cuối, dạng ****7890; số ≤ 4 ký tự → '****'.
 */
export function maskHelperBankAccount<T extends Record<string, any>>(profile: T): any {
  if (!profile) return profile;
  const doc =
    typeof (profile as any).toObject === 'function'
      ? (profile as any).toObject()
      : JSON.parse(JSON.stringify(profile));
  if (doc.bank_account?.account_number) {
    const raw = String(doc.bank_account.account_number).trim();
    doc.bank_account = {
      ...doc.bank_account,
      account_number: raw.length > 4 ? `****${raw.slice(-4)}` : '****',
    };
  }
  return doc;
}
