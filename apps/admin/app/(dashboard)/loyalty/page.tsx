'use client';

import { useState } from 'react';
import { useAdminUsers, useAdminLoyaltyUser, useAdminAdjustLoyalty } from '@/hooks/use-admin';
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
import { formatDateTime } from '@/lib/utils';

export default function AdminLoyaltyPage() {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [pointsInput, setPointsInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [message, setMessage] = useState('');
  const [confirmAdjust, setConfirmAdjust] = useState(false);

  const {
    data: usersData,
    isLoading: usersLoading,
    isError: usersError,
    refetch: refetchUsers,
  } = useAdminUsers({
    search: search || undefined,
    page: 1,
  });
  const users = usersData?.users ?? [];

  const {
    data: loyalty,
    isLoading: loyaltyLoading,
    isError: loyaltyError,
    refetch: refetchLoyalty,
  } = useAdminLoyaltyUser(selectedId || undefined);
  const adjust = useAdminAdjustLoyalty();

  const selectedUser = users.find((u: any) => u._id === selectedId);
  const account = loyalty?.account;
  const history = loyalty?.recent_history ?? [];

  const handleStartAdjust = () => {
    const points = Number(pointsInput);
    if (!selectedId || !Number.isInteger(points) || points === 0) {
      setMessage('Nhập số điểm là số nguyên khác 0 (dương = cộng, âm = trừ).');
      return;
    }
    setMessage('');
    setConfirmAdjust(true);
  };

  const executeAdjust = () => {
    const points = Number(pointsInput);
    adjust.mutate(
      { userId: selectedId, points, note: noteInput.trim() || undefined },
      {
        onSuccess: () => {
          setMessage(
            `Đã ${points > 0 ? 'cộng' : 'trừ'} ${Math.abs(points).toLocaleString('vi-VN')} điểm.`,
          );
          setPointsInput('');
          setNoteInput('');
        },
        onError: (e: any) => {
          setMessage(e?.response?.data?.message || 'Điều chỉnh điểm thất bại. Thử lại sau.');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Quản lý điểm thưởng</h1>
        <p className="text-muted-foreground">Xem số điểm của người dùng, cộng/trừ điểm kèm lý do</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tìm người dùng</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Tìm theo tên, số điện thoại hoặc email..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') setSearch(searchInput.trim());
              }}
            />
            <Button onClick={() => setSearch(searchInput.trim())}>Tìm</Button>
          </div>
          {usersLoading ? (
            <Loading />
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">
              {search ? 'Không tìm thấy người dùng nào.' : 'Nhập từ khóa để tìm người dùng.'}
            </p>
          ) : (
            <div className="mt-3 space-y-1">
              {users.slice(0, 10).map((u: any) => (
                <button
                  key={u._id}
                  onClick={() => {
                    setSelectedId(u._id);
                    setMessage('');
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-secondary ${
                    selectedId === u._id ? 'bg-secondary font-medium' : ''
                  }`}
                >
                  {u.full_name ?? '—'} • {u.phone ?? u.email ?? u._id}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <>
          {loyaltyLoading ? (
            <Loading />
          ) : !account ? (
            <EmptyState message="Không tải được tài khoản điểm của người dùng này" />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedUser?.full_name ?? selectedId} —{' '}
                    {account.points_balance.toLocaleString('vi-VN')} điểm
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge>{account.tier_label}</Badge>
                    <span className="text-sm text-muted-foreground">
                      Tích lũy: {account.lifetime_points.toLocaleString('vi-VN')} điểm
                    </span>
                    {account.next_tier_at != null && (
                      <span className="text-sm text-muted-foreground">
                        Cần thêm {account.points_to_next_tier.toLocaleString('vi-VN')} điểm để lên
                        hạng
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <Input
                      placeholder="Số điểm (vd: 100 để cộng, -50 để trừ)"
                      value={pointsInput}
                      onChange={e => setPointsInput(e.target.value)}
                      type="number"
                    />
                    <Input
                      placeholder="Lý do điều chỉnh"
                      value={noteInput}
                      onChange={e => setNoteInput(e.target.value)}
                    />
                    <Button onClick={handleStartAdjust} disabled={adjust.isPending}>
                      {adjust.isPending ? 'Đang điều chỉnh...' : 'Điều chỉnh'}
                    </Button>
                  </div>
                  {message && <p className="text-sm mt-2">{message}</p>}
                  {adjust.isError && !message && (
                    <p className="text-sm text-destructive mt-2">Điều chỉnh điểm thất bại.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lịch sử điểm gần đây</CardTitle>
                </CardHeader>
                <CardContent>
                  {loyaltyError ? (
                    <div className="p-8 text-center space-y-3">
                      <p className="text-destructive font-medium">Không thể tải lịch sử điểm</p>
                      <Button variant="outline" size="sm" onClick={() => refetchLoyalty()}>
                        Tải lại
                      </Button>
                    </div>
                  ) : history.length === 0 ? (
                    <EmptyState message="Chưa có giao dịch điểm nào" />
                  ) : (
                    <div className="overflow-x-auto w-full">
                      <Table className="min-w-[500px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Thời gian</TableHead>
                            <TableHead>Loại</TableHead>
                            <TableHead>Điểm</TableHead>
                            <TableHead>Số dư sau</TableHead>
                            <TableHead>Ghi chú</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {history.map(tx => (
                            <TableRow key={tx._id}>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDateTime(tx.created_at)}
                              </TableCell>
                              <TableCell>{tx.type}</TableCell>
                              <TableCell
                                className={
                                  tx.points > 0
                                    ? 'text-green-600 font-medium'
                                    : 'text-red-600 font-medium'
                                }
                              >
                                {tx.points > 0 ? '+' : ''}
                                {tx.points.toLocaleString('vi-VN')}
                              </TableCell>
                              <TableCell>{tx.balance_after.toLocaleString('vi-VN')}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {tx.note ?? '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {confirmAdjust && (
        <PromptDialog
          title="Xác nhận điều chỉnh điểm thưởng"
          message={`Bạn có chắc chắn muốn ${Number(pointsInput) > 0 ? 'cộng' : 'trừ'} ${Math.abs(Number(pointsInput)).toLocaleString('vi-VN')} điểm cho người dùng "${selectedUser?.full_name ?? selectedId}"${noteInput.trim() ? ` với lý do: "${noteInput.trim()}"` : ''}?`}
          confirmLabel={adjust.isPending ? 'Đang điều chỉnh...' : 'Xác nhận điều chỉnh'}
          requireInput={false}
          onSubmit={() => {
            setConfirmAdjust(false);
            executeAdjust();
          }}
          onClose={() => setConfirmAdjust(false)}
        />
      )}
    </div>
  );
}
