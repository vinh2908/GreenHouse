import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Toast from 'react-native-toast-message';
import apiClient from './api-client';

/**
 * Feature 11 (Hóa đơn điện tử): tải PDF hóa đơn của 1 job từ
 * GET /jobs/:jobId/invoice.pdf (kèm JWT qua apiClient, responseType arraybuffer).
 * - Web: tạo Blob URL + thẻ <a download> để trình duyệt tải file.
 * - Native: ghi file vào cacheDirectory bằng expo-file-system (legacy API)
 *   và báo đường dẫn qua Toast. (expo-sharing chưa được cài — không dùng.)
 */

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

export async function downloadInvoicePdf(jobId: string): Promise<void> {
  const fileName = `hoa-don-${jobId.slice(-8)}.pdf`;
  const response = await apiClient.get(`/jobs/${jobId}/invoice.pdf`, {
    responseType: 'arraybuffer',
  });
  const data = response.data as ArrayBuffer;

  if (Platform.OS === 'web') {
    // Web-only DOM APIs — khai báo cấu trúc tối thiểu vì tsconfig mobile không có DOM lib
    const g = globalThis as unknown as {
      Blob: new (parts: unknown[], opts?: { type?: string }) => unknown;
      URL: { createObjectURL: (b: unknown) => string; revokeObjectURL: (u: string) => void };
      document: {
        createElement: (tag: string) => {
          href: string;
          download: string;
          click: () => void;
          remove: () => void;
        };
        body: { appendChild: (node: unknown) => void };
      };
    };
    const blob = new g.Blob([data], { type: 'application/pdf' });
    const url = g.URL.createObjectURL(blob);
    const anchor = g.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    g.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    g.URL.revokeObjectURL(url);
    Toast.show({ type: 'success', text1: 'Đã tải hóa đơn PDF 🧾', text2: fileName });
    return;
  }

  const base64 = arrayBufferToBase64(data);
  const fileUri = `${FileSystem.cacheDirectory ?? ''}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  Toast.show({
    type: 'success',
    text1: 'Đã tải hóa đơn PDF 🧾',
    text2: `Đã lưu tại: ${fileUri}`,
    visibilityTime: 5000,
  });
}
