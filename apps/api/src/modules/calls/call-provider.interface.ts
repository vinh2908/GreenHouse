/**
 * Provider-agnostic voice call abstraction (Roadmap Phase 1 — Feature 6).
 *
 * Mọi nhà cung cấp VoIP (Stringee, Twilio, Vonage...) đều implement interface
 * này. CallsService chỉ phụ thuộc vào interface — đổi nhà cung cấp = viết
 * adapter mới + đổi env CALL_PROVIDER, không sửa logic nghiệp vụ.
 */
/** DI token cho adapter nhà cung cấp đang active (chọn theo env CALL_PROVIDER) */
export const CALL_PROVIDER = 'CALL_PROVIDER';

export interface CallProvider {
  /** Tên nhà cung cấp ('stringee', ...) */
  readonly name: string;

  /** true khi đã cấu hình đủ credentials qua biến môi trường */
  isConfigured(): boolean;

  /**
   * Cấp access token cho 1 user của app tham gia cuộc gọi.
   * Token chỉ chứa định danh nội bộ (userId của GreenHouse) — KHÔNG chứa
   * số điện thoại thật của bất kỳ ai (đây là cơ chế "che số").
   */
  createAccessToken(userId: string): Promise<{ token: string; expires_at: Date }>;
}
