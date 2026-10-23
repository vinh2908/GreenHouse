'use client';

import { useState } from 'react';
import {
  AdminVoucher,
  useAdminVouchers,
  useSaveVoucher,
  useToggleVoucher,
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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminVouchers({ search: search || undefined, page });
  const save = useSaveVoucher();
  const toggle = useToggleVoucher();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex items-center justify-between">
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
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
            <span className="text-sm text-muted-foreground">{data?.total ?? 0} mã</span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loading />
          ) : vouchers.length === 0 ? (
            <EmptyState message="Chưa có mã giảm giá nào — bấm “Tạo mã mới” để bắt đầu." />
          ) : (
            <Table>
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
                        onClick={() => toggle.mutate(v._id)}
                      >
                        {v.is_active ? 'Tắt' : 'Bật'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </div>
  );
}
