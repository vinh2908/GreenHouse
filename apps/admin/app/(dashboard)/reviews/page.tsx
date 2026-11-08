'use client';

import { useState } from 'react';
import {
  useAdminReviews,
  useAdminReplyReview,
  useAdminDeleteReview,
  useSetReviewVisibility,
  useResolveReviewAppeal,
} from '@/hooks/use-admin';
import {
  Button,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Loading,
  EmptyState,
  Pagination,
  Select,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { PromptDialog } from '@/components/common/prompt-dialog';

const RATING_OPTIONS = [
  { value: '', label: 'Tất cả sao' },
  { value: '1', label: '1 sao' },
  { value: '2', label: '2 sao' },
  { value: '3', label: '3 sao trở xuống' },
  { value: '4', label: '4 sao trở lên' },
  { value: '5', label: '5 sao' },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-500 font-medium">
      {'★'.repeat(Math.round(rating))}
      {'☆'.repeat(5 - Math.round(rating))}
      <span className="ml-1 text-foreground text-sm">{rating.toFixed(1)}</span>
    </span>
  );
}

export default function ReviewsPage() {
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [maxRating, setMaxRating] = useState<number | undefined>(undefined);
  const [ratingFilter, setRatingFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useAdminReviews({
    min_rating: minRating,
    max_rating: maxRating,
    page,
  });
  // B1: admin trả lời / xoá đánh giá
  const replyMutation = useAdminReplyReview();
  const deleteMutation = useAdminDeleteReview();
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  // B106: xác nhận bằng PromptDialog thay cho hộp thoại confirm của trình duyệt.
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // B71: ẩn/hiện đánh giá + quyết định kháng nghị
  const setVisibility = useSetReviewVisibility();
  const resolveAppeal = useResolveReviewAppeal();
  const handleRatingFilter = (value: string) => {
    setRatingFilter(value);
    setPage(1);
    if (!value) {
      setMinRating(undefined);
      setMaxRating(undefined);
    } else if (value === '3') {
      setMinRating(undefined);
      setMaxRating(3);
    } else if (value === '4') {
      setMinRating(4);
      setMaxRating(undefined);
    } else {
      setMinRating(Number(value));
      setMaxRating(Number(value));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quản lý đánh giá</h1>
        <p className="text-muted-foreground">
          Tổng cộng <span className="font-semibold text-foreground">{data?.total ?? 0}</span> đánh
          giá
        </p>
      </div>

      <div className="flex gap-3">
        <Select
          options={RATING_OPTIONS}
          value={ratingFilter}
          onChange={e => handleRatingFilter(e.target.value)}
          className="w-48"
        />
      </div>

      <div className="rounded-lg border bg-card overflow-hidden max-w-full">
        {isLoading ? (
          <Loading />
        ) : isError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-destructive font-medium">Không thể tải danh sách đánh giá</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tải lại
            </Button>
          </div>
        ) : !data?.reviews?.length ? (
          <EmptyState message="Chưa có đánh giá nào" />
        ) : (
          <>
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Helper</TableHead>
                    <TableHead>Đánh giá</TableHead>
                    <TableHead>Nhận xét</TableHead>
                    <TableHead>Phản hồi helper</TableHead>
                    <TableHead>Ngày đánh giá</TableHead>
                    <TableHead>Kháng nghị</TableHead> <TableHead>Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reviews.map(
                    (r: {
                      _id: string;
                      customer_id: { full_name: string } | null;
                      helper_id: { full_name: string } | null;
                      rating: number;
                      comment?: string;
                      tags?: string[];
                      helper_reply?: string;
                      admin_reply?: string;
                      is_hidden?: boolean;
                      created_at: string;
                      appeal_status?: string;
                      appeal_reason?: string;
                    }) => (
                      <TableRow key={r._id} className={r.is_hidden ? 'opacity-60' : undefined}>
                        <TableCell>
                          <p className="text-sm font-medium">{r.customer_id?.full_name ?? '—'}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{r.helper_id?.full_name ?? '—'}</p>
                        </TableCell>
                        <TableCell>
                          <StarRating rating={r.rating} />
                          {r.is_hidden && (
                            <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">
                              Đã ẩn
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[200px]">
                            {r.comment && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {r.comment}
                              </p>
                            )}
                            {r.tags?.length ? (
                              <div className="flex gap-1 flex-wrap mt-1">
                                {r.tags.map(t => (
                                  <span
                                    key={t}
                                    className="text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.helper_reply ? (
                            <p className="text-sm text-muted-foreground italic max-w-[180px] line-clamp-2">
                              &ldquo;{r.helper_reply}&rdquo;
                            </p>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                          {r.admin_reply && (
                            <p className="text-sm text-muted-foreground italic max-w-[180px] line-clamp-2 mt-1">
                              Admin: &ldquo;{r.admin_reply}&rdquo;
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.appeal_status === 'pending' ? (
                            <span className="text-amber-600 font-medium">
                              Chờ xử lý{r.appeal_reason ? `: ${r.appeal_reason}` : ''}
                            </span>
                          ) : r.appeal_status === 'upheld' ? (
                            <span className="text-green-600">Đã chấp nhận</span>
                          ) : r.appeal_status === 'rejected' ? (
                            <span className="text-muted-foreground">Đã bác</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {r.is_hidden ? (
                            <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                              Đã ẩn
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5 min-w-[140px]">
                            {replyingId === r._id ? (
                              <>
                                <Input
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  placeholder="Phản hồi thay mặt nền tảng..."
                                />
                                <div className="flex gap-1.5">
                                  <Button
                                    size="sm"
                                    disabled={!replyText.trim() || replyMutation.isPending}
                                    onClick={() =>
                                      replyMutation.mutate(
                                        { id: r._id, reply: replyText.trim() },
                                        {
                                          onSuccess: () => {
                                            setReplyingId(null);
                                            setReplyText('');
                                          },
                                        },
                                      )
                                    }
                                  >
                                    Gửi
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setReplyingId(null);
                                      setReplyText('');
                                    }}
                                  >
                                    Hủy
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setReplyingId(r._id);
                                  setReplyText('');
                                }}
                              >
                                Trả lời
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={setVisibility.isPending}
                              onClick={() =>
                                setVisibility.mutate({ id: r._id, hidden: !r.is_hidden })
                              }
                            >
                              {r.is_hidden ? 'Hiện lại' : 'Ẩn'}
                            </Button>
                            {r.appeal_status === 'pending' && (
                              <>
                                <button
                                  className="text-xs border rounded px-2 py-1 text-green-700"
                                  onClick={() =>
                                    resolveAppeal.mutate({ id: r._id, decision: 'upheld' })
                                  }
                                >
                                  Chấp nhận KN
                                </button>
                                <button
                                  className="text-xs border rounded px-2 py-1"
                                  onClick={() =>
                                    resolveAppeal.mutate({ id: r._id, decision: 'rejected' })
                                  }
                                >
                                  Bác KN
                                </button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => setDeleteTargetId(r._id)}
                            >
                              Xoá
                            </Button>{' '}
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
            <Pagination page={page} totalPages={data.total_pages ?? 1} onPageChange={setPage} />
          </>
        )}
      </div>

      {deleteTargetId && (
        <PromptDialog
          title="Xoá đánh giá"
          message="Xoá vĩnh viễn đánh giá này? Khách sẽ không còn thấy nó."
          confirmLabel="Xoá"
          requireInput={false}
          onSubmit={() => {
            const id = deleteTargetId;
            setDeleteTargetId(null);
            deleteMutation.mutate(id);
          }}
          onClose={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  );
}
