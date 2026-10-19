import { Platform } from 'react-native';
import apiClient from '@/services/api-client';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

// Uploads a local file:// / content:// / blob: / data: URI and returns its public URL.
// Remote URLs (already uploaded, or sample images) are passed through unchanged.
export async function uploadFile(uri: string): Promise<string> {
  if (!uri) return uri;

  // Remote URLs (already hosted on internet, not blob: / data:) pass through unchanged
  if (/^https?:\/\//i.test(uri) && !uri.startsWith('blob:')) {
    return uri;
  }

  const name = uri.split(/[\/]/).pop()?.split('?')[0] || `upload_${Date.now()}.jpg`;
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'jpg';
  const mimeType = MIME[ext] ?? 'image/jpeg';

  const form = new FormData();
  const isWeb = Platform.OS === 'web' || typeof window !== 'undefined';

  if (isWeb) {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const file = new File([blob], name, { type: blob.type || mimeType });
      form.append('file', file);
    } catch {
      const res = await fetch(uri);
      const blob = await res.blob();
      form.append('file', blob, name);
    }
  } else {
    // Native React Native (Android / iOS)
    form.append('file', { uri, name, type: mimeType } as unknown as Blob);
  }

  const { data } = await apiClient.post('/uploads', form, {
    headers: {
      'Content-Type': isWeb ? undefined : 'multipart/form-data',
    },
    timeout: 120000,
  });
  return data.data.url as string;
}

export async function uploadFiles(uris?: string[]): Promise<string[] | undefined> {
  if (!uris?.length) return uris;
  return Promise.all(uris.map(uploadFile));
}
