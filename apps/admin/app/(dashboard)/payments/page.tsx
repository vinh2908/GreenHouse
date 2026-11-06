'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { useAdminWithdrawals, useAdminTransactions, useProcessWithdrawal } from '@/hooks/use-admin';
import {
  Badge,
  Button,
  Select,
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
import { formatDateTime, formatVND } from '@/lib/utils';

const WITHDRAWAL_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'rejected', label: 'Từ chối' },
];

const TX_TYPE_OPTIONS = [
  { value: '', label: 'Tất cả loại' },
  { value: 'payment', label: 'Thanh toán' },
  { value: 'earning', label: 'Thu nhập' },
  { value: 'withdrawal', label: 'Rút tiền' },
  { value: 'refund', label: 'Hoàn tiền' },
];

const WITHDRAWAL_BADGE: Record<string, 'success' | 'danger' | 'warning' | 'secondary'> = {
  completed: 'success',
  rejected: 'danger',
  pending: 'warning',
  processing: 'info' as 'warning',
};

const TX_TYPE_BADGE: Record<string, 'success' | 'danger' | 'info' | 'secondary'> = {
  payment: 'info',
  earning: 'success',
  withdrawal: 'danger',
  refund: 'secondary',
};

export default function PaymentsPage() {
  const [wStatus, setWStatus] = useState('pending');
  const [wPage, setWPage] = useState(1);
  const [txType, setTxType] = useState('');
  const [txPage, setTxPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [approvingItem, setApprovingItem] = useState<any | null>(null);

  const { data: withdrawals, isLoading: wLoading } = useAdminWithdrawals({
    status: wStatus || undefined,
    page: wPage,
  });
  const { data: transactions, isLoading: txLoading } = useAdminTransactions({
    type: txType || undefined,
    page: txPage,
  });
  const process = useProcessWithdrawal();

  const handleApprove = (id: string) => {
    process.mutate({ id, action: 'approve' });
  };

  const handleReject = (id: string) => {
    process.mutate({ id, action: 'reject', admin_note: rejectNote });
    setRejectingId(null);
    setRejectNote('');
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Thanh toán & Rút tiền</h1>
      </div>

      {/* Withdrawals */}
      <div className="space-y-4">
        {/* G11: flex-wrap để ở 360px select lọc không bóp tiêu đề mục thành 2 dòng chật. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Yêu cầu rút tiền</h2>
          <Select
            options={WITHDRAWAL_STATUS_OPTIONS}
            value={wStatus}
            onChange={e => {
              setWStatus(e.target.value);
              setWPage(1);
            }}
            className="w-48"
          />
        </div>

        <div className="rounded-lg border bg-card overflow-hidden max-w-full">
          {wLoading ? (
            <Loading />
          ) : !withdrawals?.withdrawals?.length ? (
            <EmptyState message="Không có yêu cầu rút tiền" />
          ) : (
            <>
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Helper</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Ngân hàng</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày yêu cầu</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.withdrawals.map(
                      (w: {
                        _id: string;
                        user_id:
                          string | { _id: string; full_name?: string; phone?: string } | null;
                        amount: number;
                        status: string;
                        bank_account: {
                          bank_name: string;
                          account_number: string;
                          account_name: string;
                        };
                        admin_note?: string;
                        created_at: string;
                      }) => (
                        <Fragment key={w._id}>
                          <TableRow>
                            <TableCell>
                              {w.user_id && typeof w.user_id === 'object' ? (
                                <div>
                                  <Link
                                    href={`/users/${w.user_id._id}`}
                                    className="font-medium hover:underline"
                                  >
                                    {w.user_id.full_name ?? '—'}
                                  </Link>
                                  <p className="text-xs text-muted-foreground">{w.user_id.phone}</p>
                                </div>
                              ) : (
                                <span className="font-mono text-xs">{w.user_id ?? '—'}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-semibold text-green-700">
                              {formatVND(w.amount)}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{w.bank_account.bank_name}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {w.bank_account.account_number}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {w.bank_account.account_name}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={WITHDRAWAL_BADGE[w.status] ?? 'secondary'}>
                                {w.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDateTime(w.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              {w.status === 'pending' && (
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-300"
                                    loading={process.isPending && approvingItem?._id === w._id}
                                    onClick={() => setApprovingItem(w)}
                                  >
                                    Duyệt
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300"
                                    onClick={() =>
                                      setRejectingId(rejectingId === w._id ? null : w._id)
                                    }
                                  >
                                    Từ chối
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                          {rejectingId === w._id && (
                            <TableRow key={`${w._id}-reject`}>
                              <TableCell colSpan={6} className="bg-muted/30 py-2 px-4">
                                <div className="flex gap-2">
                                  <input
                                    className="flex-1 h-8 rounded border border-input px-2 text-sm"
                                    placeholder="Ghi chú từ chối..."
                                    value={rejectNote}
                                    onChange={e => setRejectNote(e.target.value)}
                                  />
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    loading={process.isPending}
                                    onClick={() => handleReject(w._id)}
                                  >
                                    Xác nhận
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setRejectingId(null)}
                                  >
                                    Hủy
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ),
                    )}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={wPage}
                totalPages={withdrawals.total_pages ?? 1}
                onPageChange={setWPage}
              />
            </>
          )}
        </div>
      </div>

      {/* Transactions */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Lịch sử giao dịch</h2>
          <Select
            options={TX_TYPE_OPTIONS}
            value={txType}
            onChange={e => {
              setTxType(e.target.value);
              setTxPage(1);
            }}
            className="w-48"
          />
        </div>

        <div className="rounded-lg border bg-card overflow-hidden max-w-full">
          {txLoading ? (
            <Loading />
          ) : !transactions?.transactions?.length ? (
            <EmptyState message="Chưa có giao dịch" />
          ) : (
            <>
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại</TableHead>
                      <TableHead>Mô tả</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thời gian</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.transactions.map(
                      (tx: {
                        _id: string;
                        type: string;
                        description: string;
                        amount: number;
                        status: string;
                        created_at: string;
                      }) => (
                        <TableRow key={tx._id}>
                          <TableCell>
                            <Badge variant={TX_TYPE_BADGE[tx.type] ?? 'secondary'}>{tx.type}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{tx.description}</TableCell>
                          <TableCell
                            className={`font-semibold ${
                              tx.type === 'earning' || tx.type === 'refund'
                                ? 'text-green-700'
                                : 'text-foreground'
                            }`}
                          >
                            {tx.type === 'earning' || tx.type === 'refund' ? '+' : ''}
                            {formatVND(tx.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                tx.status === 'success'
                                  ? 'success'
                                  : tx.status === 'failed'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {tx.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(tx.created_at)}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={txPage}
                totalPages={transactions.total_pages ?? 1}
                onPageChange={setTxPage}
              />
            </>
          )}
        </div>
      </div>

      {/* A98: Màn xác nhận duyệt rút tiền */}
      {approvingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border space-y-4">
            <h3 className="text-lg font-bold">Xác nhận duyệt rút tiền</h3>
            <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Người nhận:</span>
                <span className="font-semibold">
                  {typeof approvingItem.user_id === 'object'
                    ? approvingItem.user_id?.full_name
                    : approvingItem.user_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số tiền rút:</span>
                <span className="font-bold text-green-600">{formatVND(approvingItem.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phí rút:</span>
                <span className="font-semibold text-muted-foreground">0₫ (Miễn phí)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ngân hàng:</span>
                <span className="font-medium">{approvingItem.bank_account?.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số tài khoản:</span>
                <span className="font-mono font-medium">
                  {approvingItem.bank_account?.account_number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tên thụ hưởng:</span>
                <span className="font-medium">{approvingItem.bank_account?.account_name}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Vui lòng kiểm tra kỹ thông tin trước khi xác nhận. Sau khi duyệt, hệ thống sẽ trừ số
              dư ví và gửi thông báo tới thợ.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setApprovingItem(null)}>
                Hủy bỏ
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                loading={process.isPending}
                onClick={() => {
                  process.mutate(
                    { id: approvingItem._id, action: 'approve' },
                    { onSettled: () => setApprovingItem(null) },
                  );
                }}
              >
                Xác nhận duyệt chuyển khoản
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
