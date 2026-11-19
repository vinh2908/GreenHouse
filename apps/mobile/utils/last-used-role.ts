// utils/last-used-role.ts — R14-L4: Lưu và khôi phục vai trò dùng lần cuối.
//
// Vấn đề: Tài khoản 2 vai trò (khách + thợ, ví dụ thợ 0365290805) sau khi
// đăng xuất rồi đăng nhập lại bị rơi về chế độ khách, trang hợp đồng tháng
// không hiện nút điểm danh.
// Nguyên nhân: auth.store.ts khi logout đã xóa ROLE_KEY, nên lúc đăng nhập lại
// SecureStore không còn vai trò lưu trên thiết bị; resolveLandingRole mặc định
// rơi về customer; đồng thời login.tsx đọc nhầm user.active_role thô từ server.
//
// File này cung cấp:
// 1. Quản lý lưu trữ vai trò dùng lần cuối (theo thiết bị và theo số điện thoại).
//    Vai trò này KHÔNG bị xóa khi đăng xuất.
// 2. Quyết định vai trò đăng nhập đúng cho tài khoản 2 vai trò.

import { resolveLandingRole, type LandingRole } from './landing-role';

export const LAST_USED_ROLE_KEY = 'homemate_last_used_role';

async function getStorage() {
  try {
    return await import('../services/secure-storage');
  } catch {
    return null;
  }
}

export function normalizePhoneKey(phone?: string | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const clean = phone.trim().replace(/\s+/g, '').replace(/^\+84/, '0');
  return clean || null;
}

export function getPhoneRoleStorageKey(phone?: string | null): string | null {
  const norm = normalizePhoneKey(phone);
  return norm ? `${LAST_USED_ROLE_KEY}_${norm}` : null;
}

/** Lưu vai trò dùng lần cuối vào SecureStorage + fallback localStorage */
export async function saveLastUsedRole(
  role: 'customer' | 'helper',
  phone?: string | null,
): Promise<void> {
  if (role !== 'customer' && role !== 'helper') return;

  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  const phoneKey = getPhoneRoleStorageKey(phone);
  const storage = await getStorage();

  // 1. Global / device last used role
  if (storage) {
    try {
      await storage.setItemAsync(LAST_USED_ROLE_KEY, role);
    } catch {}
  }
  if (g?.localStorage) {
    try {
      g.localStorage.setItem(LAST_USED_ROLE_KEY, role);
    } catch {}
  }

  // 2. Per-phone last used role
  if (phoneKey) {
    if (storage) {
      try {
        await storage.setItemAsync(phoneKey, role);
      } catch {}
    }
    if (g?.localStorage) {
      try {
        g.localStorage.setItem(phoneKey, role);
      } catch {}
    }
  }
}

/** Lấy vai trò dùng lần cuối (ưu tiên theo SĐT của tài khoản, fallback theo thiết bị) */
export async function getLastUsedRole(phone?: string | null): Promise<LandingRole | null> {
  const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
  const phoneKey = getPhoneRoleStorageKey(phone);
  const storage = await getStorage();

  // 1. Thử đọc theo SĐT trước
  if (phoneKey) {
    if (storage) {
      try {
        const stored = await storage.getItemAsync(phoneKey);
        if (stored === 'customer' || stored === 'helper') return stored;
      } catch {}
    }
    if (g?.localStorage) {
      try {
        const stored = g.localStorage.getItem(phoneKey);
        if (stored === 'customer' || stored === 'helper') return stored;
      } catch {}
    }
  }

  // 2. Fallback đọc theo thiết bị
  if (storage) {
    try {
      const stored = await storage.getItemAsync(LAST_USED_ROLE_KEY);
      if (stored === 'customer' || stored === 'helper') return stored;
    } catch {}
  }
  if (g?.localStorage) {
    try {
      const stored = g.localStorage.getItem(LAST_USED_ROLE_KEY);
      if (stored === 'customer' || stored === 'helper') return stored;
    } catch {}
  }

  return null;
}

/** Tính toán vai trò đăng nhập cuối cùng cho user */
export function determineLoginLandingRole(
  user: { roles?: unknown; active_role?: unknown } | null | undefined,
  lastUsedRole?: string | null,
): LandingRole {
  return resolveLandingRole(user?.roles, user?.active_role, lastUsedRole ?? undefined);
}
