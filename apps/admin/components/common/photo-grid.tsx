import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { mediaUrl } from '@/lib/utils';

// Thumbnails for uploaded photos; legacy file:// paths from old app builds cannot be shown.
export function PhotoGrid({ urls }: { urls?: string[] }) {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  if (!urls?.length) return <p className="text-sm text-muted-foreground">Không có</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {urls.map(rawUrl => {
        const url = mediaUrl(rawUrl) || rawUrl;
        const isHttp = /^https?:\/\//.test(url);
        const hasFailed = failedUrls[rawUrl] || failedUrls[url];

        if (!isHttp) {
          return (
            <div
              key={rawUrl}
              className="flex h-28 items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground"
            >
              Ảnh lưu trên máy người dùng (chưa upload)
            </div>
          );
        }

        if (hasFailed) {
          return (
            <div
              key={rawUrl}
              className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-2 text-center text-xs text-muted-foreground"
            >
              <ImageOff className="h-5 w-5 text-muted-foreground/60" />
              <span>Ảnh không tải được</span>
            </div>
          );
        }

        return (
          <a key={rawUrl} href={url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="h-28 w-full rounded-md border object-cover"
              onError={() =>
                setFailedUrls(prev => ({ ...prev, [rawUrl]: true, [url]: true }))
              }
            />
          </a>
        );
      })}
    </div>
  );
}
