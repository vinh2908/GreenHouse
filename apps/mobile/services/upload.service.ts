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

// Uploads a local file:// / content:// URI and returns its public URL.
// Remote URLs (already uploaded, or sample images) are passed through unchanged.
export async function uploadFile(uri: string): Promise<string> {
  if (/^https?:\/\//i.test(uri)) return uri;
  const name = uri.split(/[\/]/).pop()?.split('?')[0] || 'upload.jpg';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : 'jpg';
  const form = new FormData();
  form.append('file', { uri, name, type: MIME[ext] ?? 'image/jpeg' } as unknown as Blob);
  const { data } = await apiClient.post('/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data.data.url as string;
}

export async function uploadFiles(uris?: string[]): Promise<string[] | undefined> {
  if (!uris?.length) return uris;
  return Promise.all(uris.map(uploadFile));
}
