'use client';

import { useState } from 'react';
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
  Card,
  CardHeader,
  CardTitle,
  CardContent,
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
        <div className="flex items-center justify-between">
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

        <div className="rounded-lg border bg-card">
          {wLoading ? (
            <Loading />
          ) : !withdrawals?.withdrawals?.length ? (
            <EmptyState message="Không có yêu cầu rút tiền" />
          ) : (
            <>
              <Table>
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
                      user_id: string;
                      amount: number;
                      status: string;
                      bank_account: { bank_name: string; account_number: string; account_name: string };
                      admin_note?: string;
                      created_at: string;
                    }) => (
                      <>
                        <TableRow key={w._id}>
                          <TableCell className="font-mono text-xs">{w.user_id}</TableCell>
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
                                  loading={process.isPending}
                                  onClick={() => handleApprove(w._id)}
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
                      </>
                    ),
                  )}
                </TableBody>
              </Table>
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
        <div className="flex items-center justify-between">
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

        <div className="rounded-lg border bg-card">
          {txLoading ? (
            <Loading />
          ) : !transactions?.transactions?.length ? (
            <EmptyState message="Chưa có giao dịch" />
          ) : (
            <>
              <Table>
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
                          <Badge variant={TX_TYPE_BADGE[tx.type] ?? 'secondary'}>
                            {tx.type}
                          </Badge>
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
              <Pagination
                page={txPage}
                totalPages={transactions.total_pages ?? 1}
                onPageChange={setTxPage}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
