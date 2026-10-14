'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { usePendingKyc, useApproveKyc, useRejectKyc } from '@/hooks/use-admin';
import {
  Button,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Loading,
  EmptyState,
  Pagination,
} from '@/components/ui';
import { formatDateTime, mediaUrl } from '@/lib/utils';
import {
  CheckCircle,
  XCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
} from 'lucide-react';

type KycHelper = {
  _id: string;
  user_id: { _id: string; full_name: string; phone: string } | null;
  id_card_number?: string;
  id_card_front?: string;
  id_card_back?: string;
  selfie_photo?: string;
  created_at: string;
};

type KycImage = { label: string; url?: string };
type Viewer = { title: string; images: KycImage[]; index: number };

function kycImages(h: KycHelper): KycImage[] {
  return [
    { label: 'CCCD mặt trước', url: mediaUrl(h.id_card_front) },
    { label: 'CCCD mặt sau', url: mediaUrl(h.id_card_back) },
    { label: 'Ảnh chân dung', url: mediaUrl(h.selfie_photo) },
  ];
}

function KycImages({ helper, onOpen }: { helper: KycHelper; onOpen: (v: Viewer) => void }) {
  const images = kycImages(helper);
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {images.map((img, i) => (
        <div key={img.label} className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">{img.label}</p>
          {img.url && !failed[i] ? (
            <button
              type="button"
              title="Bấm để xem ảnh gốc"
              className="block h-64 w-full cursor-zoom-in overflow-hidden rounded-md border bg-neutral-900"
              onClick={() =>
                onOpen({ title: helper.user_id?.full_name ?? 'Hồ sơ KYC', images, index: i })
              }
            >
              {/* Plain <img>: the original file, no resizing or recompression. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.label}
                className="h-full w-full object-contain"
                onError={() => setFailed(f => ({ ...f, [i]: true }))}
              />
            </button>
          ) : (
            <div className="flex h-64 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-background text-xs text-muted-foreground">
              <ImageOff className="h-5 w-5" />
              {img.url ? 'Không tải được ảnh' : 'Chưa có ảnh'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KycViewer({ viewer, onChange }: { viewer: Viewer; onChange: (v: Viewer | null) => void }) {
  const { images, index, title } = viewer;
  const current = images[index];
  const step = (d: number) => {
    const n = images.length;
    for (let k = 1; k <= n; k++) {
      const next = (index + d * k + n * k) % n;
      if (images[next].url) return onChange({ ...viewer, index: next });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChange(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => onChange(null)}>
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 text-white"
        onClick={e => e.stopPropagation()}
      >
        <p className="truncate text-sm font-semibold">
          {title} — {current.label}
        </p>
        <div className="flex items-center gap-2">
          <a
            href={current.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-white/10"
          >
            <ExternalLink className="h-3 w-3" />
            Mở ảnh gốc
          </a>
          <button
            type="button"
            aria-label="Đóng"
            className="rounded p-1 hover:bg-white/10"
            onClick={() => onChange(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-4">
        <button
          type="button"
          aria-label="Ảnh trước"
          className="absolute left-2 rounded-full p-2 text-white hover:bg-white/10"
          onClick={e => {
            e.stopPropagation();
            step(-1);
          }}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.label}
          className="max-h-full max-w-full object-contain"
          onClick={e => e.stopPropagation()}
        />
        <button
          type="button"
          aria-label="Ảnh sau"
          className="absolute right-2 rounded-full p-2 text-white hover:bg-white/10"
          onClick={e => {
            e.stopPropagation();
            step(1);
          }}
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}

export default function KycPendingPage() {
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const { data, isLoading } = usePendingKyc({ page });
  const approve = useApproveKyc();
  const reject = useRejectKyc();

  const handleReject = (userId: string) => {
    if (!rejectReason.trim()) return;
    reject.mutate({ userId, reason: rejectReason });
    setRejectingId(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">KYC chờ duyệt</h1>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{data?.total ?? 0}</span> hồ sơ đang chờ
          xét duyệt
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <Loading />
        ) : !data?.helpers?.length ? (
          <EmptyState message="Không có hồ sơ KYC nào chờ duyệt" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>CCCD</TableHead>
                  <TableHead>Nộp hồ sơ</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.helpers.map((h: KycHelper) => (
                  <Fragment key={h._id}>
                    <TableRow>
                      <TableCell>
                        {h.user_id ? (
                          <Link
                            href={`/users/${h.user_id._id}`}
                            className="font-medium hover:underline"
                          >
                            {h.user_id.full_name}
                          </Link>
                        ) : (
                          <p className="font-medium">—</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{h.user_id?.phone ?? '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{h.id_card_number ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(h.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            loading={approve.isPending}
                            onClick={() => h.user_id && approve.mutate(h.user_id._id)}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            onClick={() => setRejectingId(rejectingId === h._id ? null : h._id)}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Từ chối
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* KYC Images row */}
                    <TableRow>
                      <TableCell colSpan={5} className="py-2 px-4 bg-muted/30">
                        <KycImages helper={h} onOpen={setViewer} />
                        {/* Reject form */}
                        {rejectingId === h._id && (
                          <div className="mt-3 flex gap-2 items-center">
                            <input
                              className="flex-1 h-8 rounded border border-input px-2 text-sm"
                              placeholder="Lý do từ chối..."
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              loading={reject.isPending}
                              onClick={() => h.user_id && handleReject(h.user_id._id)}
                            >
                              Xác nhận từ chối
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason('');
                              }}
                            >
                              Hủy
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={data.total_pages ?? 1} onPageChange={setPage} />
          </>
        )}
      </div>

      {viewer && <KycViewer viewer={viewer} onChange={setViewer} />}
    </div>
  );
}
