// Thumbnails for uploaded photos; legacy file:// paths from old app builds cannot be shown.
export function PhotoGrid({ urls }: { urls?: string[] }) {
  if (!urls?.length) return <p className="text-sm text-muted-foreground">Không có</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {urls.map(url =>
        /^https?:\/\//.test(url) ? (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-28 w-full rounded-md border object-cover" />
          </a>
        ) : (
          // Legacy rows stored the phone's local file:// path, which cannot be viewed.
          <div
            key={url}
            className="flex h-28 items-center justify-center rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground"
          >
            Ảnh lưu trên máy người dùng (chưa upload)
          </div>
        ),
      )}
    </div>
  );
}
