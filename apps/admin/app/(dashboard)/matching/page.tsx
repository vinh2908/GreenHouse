'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useOptimalHelpers, useMatchBatch, useAssignHelper } from '@/hooks/use-admin';
import { PromptDialog } from '@/components/common/prompt-dialog';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Loading,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';

export default function AdminMatchingPage() {
  const [jobIdInput, setJobIdInput] = useState('');
  const [jobId, setJobId] = useState('');
  const { data: matches, isLoading, isError, refetch } = useOptimalHelpers(jobId || undefined);
  const batch = useMatchBatch();
  const assignMutation = useAssignHelper();
  const [batchResult, setBatchResult] = useState<any>(null);
  const [assignConfirm, setAssignConfirm] = useState<{
    jobId: string;
    helperId: string;
    helperName: string;
    jobTitle: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const runBatch = () => {
    setBatchResult(null);
    batch.mutate(undefined, {
      onSuccess: d => setBatchResult(d),
    });
  };

  const handleAssignSubmit = () => {
    if (!assignConfirm) return;
    assignMutation.mutate(
      { jobId: assignConfirm.jobId, helperId: assignConfirm.helperId },
      {
        onSuccess: () => {
          setAssignConfirm(null);
          setFeedback({ type: 'success', message: `Đã gán thợ ${assignConfirm.helperName} thành công!` });
          refetch();
        },
        onError: (err: any) => {
          setAssignConfirm(null);
          setFeedback({
            type: 'error',
            message: err?.response?.data?.message || 'Gán thợ thất bại. Vui lòng kiểm tra lại.',
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ghép thợ tối ưu (Hungarian)</h1>
        <p className="text-muted-foreground">
          Xem thợ được ghép cho 1 đơn kèm điểm và lý do xếp hạng, hoặc chạy ghép hàng loạt
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thợ tối ưu cho 1 đơn</CardTitle>
        </CardHeader>
        <CardContent>
          {feedback && (
            <div
              className={`p-3 rounded-lg text-sm mb-4 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.message}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Nhập ID đơn hàng (job_id)..."
              value={jobIdInput}
              onChange={e => setJobIdInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') setJobId(jobIdInput.trim());
              }}
            />
            <Button onClick={() => setJobId(jobIdInput.trim())}>Xem kết quả ghép</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Lấy ID đơn từ{' '}
            <Link href="/jobs" className="text-primary underline">
              trang Quản lý Đơn hàng
            </Link>
            .
          </p>
          {jobId && (
            <div className="mt-4">
              {isLoading ? (
                <Loading />
              ) : isError ? (
                <EmptyState message="Không tải được kết quả ghép. Kiểm tra lại ID đơn." />
              ) : !matches?.length ? (
                <EmptyState message="Không có thợ nào đủ điều kiện ghép cho đơn này (cần thợ ONLINE và đã duyệt e-KYC)." />
              ) : (
                <div className="overflow-x-auto w-full">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Thợ</TableHead>
                        <TableHead>Đánh giá</TableHead>
                        <TableHead>Khoảng cách</TableHead>
                        <TableHead>Điểm ghép</TableHead>
                        <TableHead>Lý do xếp hạng</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matches.map((m, i) => (
                        <TableRow key={m.helper._id}>
                          <TableCell className="font-bold">{i + 1}</TableCell>
                          <TableCell>
                            <p className="font-medium">{m.helper.full_name}</p>
                            <p className="text-xs text-muted-foreground">{m.helper.phone}</p>
                            <p className="text-xs text-muted-foreground">
                              Đơn: {m.job.title} • {m.job.district}
                            </p>
                          </TableCell>
                          <TableCell>{m.helper.average_rating?.toFixed(1) ?? '—'} ★</TableCell>
                          <TableCell>
                            {m.helper.distance_km != null ? `${m.helper.distance_km} km` : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge>{m.match_score?.toFixed(2) ?? '—'}</Badge>
                          </TableCell>
                          <TableCell>
                            <ul className="text-sm text-muted-foreground list-disc pl-4">
                              {m.match_reasons?.map((r, j) => (
                                <li key={j}>{r}</li>
                              ))}
                            </ul>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              disabled={assignMutation.isPending}
                              onClick={() =>
                                setAssignConfirm({
                                  jobId: (m.job as any)?._id || jobId,
                                  helperId: m.helper._id,
                                  helperName: m.helper.full_name,
                                  jobTitle: m.job.title,
                                })
                              }
                            >
                              Gán thợ này
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ghép hàng loạt (toàn bộ đơn đang mở)</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={runBatch} disabled={batch.isPending}>
            {batch.isPending ? 'Đang ghép...' : 'Chạy ghép hàng loạt'}
          </Button>
          {batch.isError && (
            <p className="text-sm text-destructive mt-2">Chạy ghép hàng loạt thất bại.</p>
          )}
          {batchResult && (
            <pre className="text-xs bg-secondary p-3 rounded-md mt-3 overflow-x-auto">
              {JSON.stringify(batchResult, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {assignConfirm && (
        <PromptDialog
          title="Xác nhận gán thợ thủ công"
          message={`Bạn có chắc chắn muốn gán thợ ${assignConfirm.helperName} cho đơn #${assignConfirm.jobId.slice(-6)} ("${assignConfirm.jobTitle}")? Thao tác này sẽ tạo hợp đồng và chuyển đơn sang trạng thái ĐÃ NHẬN VIỆC.`}
          confirmLabel={assignMutation.isPending ? 'Đang gán...' : 'Xác nhận gán'}
          requireInput={false}
          onSubmit={handleAssignSubmit}
          onClose={() => setAssignConfirm(null)}
        />
      )}
    </div>
  );
}
