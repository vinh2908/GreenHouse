'use client';

import { useEffect, useState } from 'react';
import {
  AdminVoucher,
  useAdminVouchers,
  useSaveVoucher,
  useToggleVoucher,
  useDeleteVoucher,
} from '@/hooks/use-admin';
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
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatVND } from '@/lib/utils';

type Draft = {
  id?: string;
  code: string;
  description: string;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  max_discount_amount: string;
  min_order_amount: string;
  total_usage_limit: string;
  per_user_limit: string;
  valid_from: string;
  valid_to: string;
};

const EMPTY: Draft = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: '10',
  max_discount_amount: '',
  min_order_amount: '0',
  total_usage_limit: '',
  per_user_limit: '1',
  valid_from: '',
  valid_to: '',
};

const errorMessage = (err: unknown) => {
  const msg = (
    err as { response?: { data?: { message?: string; error?: { details?: string[] } } } }
  )?.response?.data;
  return msg?.error?.details?.join(', ') || msg?.message || 'Có lỗi xảy ra';
};

const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '');

export default function VouchersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // C03: Debounce 300ms cho ô tìm kiếm
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useAdminVouchers({
    search: debouncedSearch || undefined,
    page,
  });
  const save = useSaveVoucher();
  const toggle = useToggleVoucher();
  const deleteVoucher = useDeleteVoucher();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggleVoucherTarget, setToggleVoucherTarget] = useState<AdminVoucher | null>(null);
  const [deleteVoucherTarget, setDeleteVoucherTarget] = useState<AdminVoucher | null>(null);

  const vouchers = data?.vouchers ?? [];

  const edit = (v: AdminVoucher) =>
    setDraft({
      id: v._id,
      code: v.code,
      description: v.description ?? '',
      discount_type: v.discount_type,
      discount_value: String(v.discount_value),
      max_discount_amount: v.max_discount_amount ? String(v.max_discount_amount) : '',
      min_order_amount: String(v.min_order_amount ?? 0),
      total_usage_limit: v.total_usage_limit ? String(v.total_usage_limit) : '',
      per_user_limit: String(v.per_user_limit ?? 1),
      valid_from: toDateInput(v.valid_from),
      valid_to: toDateInput(v.valid_to),
    });

  const handleSave = async () => {
    if (!draft) return;
    setError(null);

    // C02: Client-side validations
    if (!draft.id && !draft.code.trim()) {
      setError('Mã voucher không được để trống');
      return;
    }
    const val = Number(draft.discount_value) || 0;
    if (val <= 0) {
      setError('Giá trị giảm giá phải lớn hơn 0');
      return;
    }
    if (draft.discount_type === 'percent' && val > 100) {
      setError('Phần trăm giảm giá không được vượt quá 100%');
      return;
    }
    if (draft.valid_from && draft.valid_to) {
      if (new Date(draft.valid_to) <= new Date(draft.valid_from)) {
        setError('Ngày hết hạn phải sau ngày bắt đầu áp dụng');
        return;
      }
    }

    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    try {
      await save.mutateAsync({
        id: draft.id,
        ...(draft.id ? {} : { code: draft.code.trim().toUpperCase() }),
        description: draft.description || undefined,
        discount_type: draft.discount_type,
        discount_value: Number(draft.discount_value) || 0,
        max_discount_amount: num(draft.max_discount_amount),
        min_order_amount: Number(draft.min_order_amount) || 0,
        total_usage_limit: num(draft.total_usage_limit),
        per_user_limit: Number(draft.per_user_limit) || 1,
        valid_from: draft.valid_from ? new Date(draft.valid_from).toISOString() : undefined,
        valid_to: draft.valid_to ? new Date(draft.valid_to).toISOString() : undefined,
      });
      setDraft(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* G11: flex-wrap để ở 360px nút tạo mã không bóp tiêu đề thành 2 dòng chật. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Mã giảm giá (Voucher)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tạo và quản lý mã giảm giá cho khách hàng. Phần giảm do nền tảng chịu — thợ vẫn nhận đủ
            theo hợp đồng.
          </p>
        </div>
        <Button
          onClick={() => {
            setError(null);
            setDraft(EMPTY);
          }}
        >
          + Tạo mã mới
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Tìm theo mã…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="max-w-xs"
            />
            <span className="text-sm text-muted-foreground">{data?.total ?? 0} mã</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loading />
          ) : isError ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-destructive font-medium">Không thể tải danh sách mã giảm giá</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tải lại
              </Button>
            </div>
          ) : vouchers.length === 0 ? (
            <EmptyState message="Chưa có mã giảm giá nào — bấm “Tạo mã mới” để bắt đầu." />
          ) : (
            <div className="overflow-x-auto w-full">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Ưu đãi</TableHead>
                    <TableHead>Điều kiện</TableHead>
                    <TableHead>Đã dùng</TableHead>
                    <TableHead>Hiệu lực</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map(v => (
                    <TableRow key={v._id}>
                      <TableCell className="font-bold">{v.code}</TableCell>
                      <TableCell>
                        {v.discount_type === 'percent'
                          ? `Giảm ${v.discount_value}%${
                              v.max_discount_amount
                                ? ` (tối đa ${formatVND(v.max_discount_amount)})`
                                : ''
                            }`
                          : `Giảm ${formatVND(v.discount_value)}`}
                        {v.description && (
                          <p className="text-xs text-muted-foreground">{v.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        Đơn ≥ {formatVND(v.min_order_amount ?? 0)} · tối đa {v.per_user_limit}{' '}
                        lần/khách
                      </TableCell>
                      <TableCell>
                        {v.used_count}
                        {v.total_usage_limit ? ` / ${v.total_usage_limit}` : ' / ∞'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {v.valid_from ? new Date(v.valid_from).toLocaleDateString('vi-VN') : '—'}
                        {' → '}
                        {v.valid_to ? new Date(v.valid_to).toLocaleDateString('vi-VN') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={v.is_active ? 'default' : 'secondary'}>
                          {v.is_active ? 'Đang bật' : 'Đã tắt'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => edit(v)}>
                          Sửa
                        </Button>
                        <Button
                          size="sm"
                          variant={v.is_active ? 'destructive' : 'default'}
                          onClick={() => setToggleVoucherTarget(v)}
                        >
                          {v.is_active ? 'Tắt' : 'Bật'}
                        </Button>
                        {v.used_count === 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteVoucherTarget(v)}
                          >
                            Xóa
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {(data?.total_pages ?? 1) > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Trước
              </Button>
              <span className="text-sm">
                Trang {page} / {data?.total_pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= (data?.total_pages ?? 1)}
                onClick={() => setPage(p => p + 1)}
              >
                Sau
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>{draft.id ? `Sửa mã ${draft.code}` : 'Tạo mã giảm giá mới'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-semibold">Mã *</label>
                <Input
                  value={draft.code}
                  disabled={!!draft.id}
                  onChange={e =>
                    setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s/g, '') })
                  }
                  placeholder="VD: GIAM10"
                />
              </div>
              <div>
                <Select
                  label="Loại giảm *"
                  value={draft.discount_type}
                  onChange={e =>
                    setDraft({ ...draft, discount_type: e.target.value as Draft['discount_type'] })
                  }
                  options={[
                    { value: 'percent', label: 'Theo %' },
                    { value: 'fixed', label: 'Số tiền cố định' },
                  ]}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">
                  Giá trị giảm * {draft.discount_type === 'percent' ? '(%)' : '(VNĐ)'}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={draft.discount_type === 'percent' ? 100 : undefined}
                  value={draft.discount_value}
                  onChange={e => setDraft({ ...draft, discount_value: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Giảm tối đa (VNĐ, chỉ cho %)</label>
                <Input
                  type="number"
                  value={draft.max_discount_amount}
                  onChange={e => setDraft({ ...draft, max_discount_amount: e.target.value })}
                  placeholder="Để trống = không giới hạn"
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Đơn tối thiểu (VNĐ)</label>
                <Input
                  type="number"
                  value={draft.min_order_amount}
                  onChange={e => setDraft({ ...draft, min_order_amount: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Tổng lượt dùng tối đa</label>
                <Input
                  type="number"
                  value={draft.total_usage_limit}
                  onChange={e => setDraft({ ...draft, total_usage_limit: e.target.value })}
                  placeholder="Để trống = không giới hạn"
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Lượt tối đa / khách</label>
                <Input
                  type="number"
                  value={draft.per_user_limit}
                  onChange={e => setDraft({ ...draft, per_user_limit: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Áp dụng từ ngày</label>
                <Input
                  type="date"
                  value={draft.valid_from}
                  onChange={e => setDraft({ ...draft, valid_from: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Hết hạn ngày</label>
                <Input
                  type="date"
                  value={draft.valid_to}
                  onChange={e => setDraft({ ...draft, valid_to: e.target.value })}
                />
              </div>
              <div className="md:col-span-3">
                <label className="text-sm font-semibold">Mô tả</label>
                <Input
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  placeholder="VD: Giảm 10% cho khách mới"
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive font-semibold">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDraft(null)}>
                Hủy
              </Button>
              <Button onClick={handleSave} disabled={save.isPending}>
                {save.isPending ? 'Đang lưu…' : 'Lưu mã giảm giá'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* A100: Màn xác nhận Bật/Tắt voucher */}
      {toggleVoucherTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border space-y-4">
            <h3 className="text-lg font-bold">
              {toggleVoucherTarget.is_active ? 'Xác nhận tắt voucher' : 'Xác nhận bật voucher'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Bạn có chắc chắn muốn {toggleVoucherTarget.is_active ? 'tắt' : 'bật'} mã giảm giá{' '}
              <strong className="text-foreground font-mono">{toggleVoucherTarget.code}</strong>?
            </p>
            <p className="text-xs text-muted-foreground">
              {toggleVoucherTarget.is_active
                ? 'Sau khi tắt, khách hàng sẽ không thể nhập hoặc áp dụng mã này cho đơn hàng mới.'
                : 'Sau khi bật, mã giảm giá sẽ có hiệu lực và khách hàng có thể áp dụng theo điều kiện quy định.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setToggleVoucherTarget(null)}>
                Hủy bỏ
              </Button>
              <Button
                variant={toggleVoucherTarget.is_active ? 'destructive' : 'default'}
                loading={toggle.isPending}
                onClick={async () => {
                  await toggle.mutateAsync(toggleVoucherTarget._id);
                  setToggleVoucherTarget(null);
                }}
              >
                {toggleVoucherTarget.is_active ? 'Đồng ý tắt voucher' : 'Đồng ý bật voucher'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* A100: Màn xác nhận Xóa voucher */}
      {deleteVoucherTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border space-y-4">
            <h3 className="text-lg font-bold text-destructive">Xác nhận xóa voucher</h3>
            <p className="text-sm text-muted-foreground">
              Bạn có chắc chắn muốn xóa vĩnh viễn voucher{' '}
              <strong className="text-foreground font-mono">{deleteVoucherTarget.code}</strong>?
            </p>
            <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">
              Voucher này chưa có lượt sử dụng nào ({deleteVoucherTarget.used_count} lượt dùng).
              Hành động này không thể hoàn tác.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeleteVoucherTarget(null)}>
                Hủy bỏ
              </Button>
              <Button
                variant="destructive"
                loading={deleteVoucher.isPending}
                onClick={async () => {
                  await deleteVoucher.mutateAsync(deleteVoucherTarget._id);
                  setDeleteVoucherTarget(null);
                }}
              >
                Xác nhận xóa vĩnh viễn
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
