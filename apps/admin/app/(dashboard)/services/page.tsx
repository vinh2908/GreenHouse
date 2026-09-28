'use client';

import { useState } from 'react';
import {
  AdminService,
  useAdminServices,
  useCreateServiceCategory,
  useSaveService,
  useServiceCategories,
  useToggleService,
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
  name: string;
  slug: string;
  description: string;
  category_id: string;
  price_range_min: string;
  price_range_max: string;
  platform_fee_percent: string;
};

const EMPTY: Draft = {
  name: '',
  slug: '',
  description: '',
  category_id: '',
  price_range_min: '0',
  price_range_max: '0',
  platform_fee_percent: '15',
};

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const errorMessage = (err: unknown) => {
  const msg = (
    err as { response?: { data?: { message?: string; error?: { details?: string[] } } } }
  )?.response?.data;
  return msg?.error?.details?.join(', ') || msg?.message || 'Có lỗi xảy ra';
};

export default function ServicesPage() {
  const { data: services, isLoading } = useAdminServices();
  const { data: categories } = useServiceCategories();
  const save = useSaveService();
  const toggle = useToggleService();
  const createCategory = useCreateServiceCategory();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCategory, setNewCategory] = useState('');

  const edit = (s: AdminService) =>
    setDraft({
      id: s._id,
      name: s.name,
      slug: s.slug,
      description: s.description ?? '',
      category_id: s.category_id?._id ?? '',
      price_range_min: String(s.price_range_min ?? 0),
      price_range_max: String(s.price_range_max ?? 0),
      platform_fee_percent: String(s.platform_fee_percent ?? 15),
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const { id, category_id, description, ...rest } = draft;
    save.mutate(
      {
        id,
        ...rest,
        // Existing services may point to a missing category; only send one when chosen.
        ...(category_id ? { category_id } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        price_range_min: Number(rest.price_range_min),
        price_range_max: Number(rest.price_range_max),
        platform_fee_percent: Number(rest.platform_fee_percent),
      },
      { onSuccess: () => setDraft(null) },
    );
  };

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft(d => (d ? { ...d, [key]: e.target.value } : d));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dịch vụ</h1>
          <p className="text-muted-foreground">
            Bật/tắt dịch vụ, chỉnh khoảng giá và phí nền tảng áp dụng cho báo giá mới
          </p>
        </div>
        <Button onClick={() => setDraft({ ...EMPTY, category_id: categories?.[0]?._id ?? '' })}>
          + Thêm dịch vụ
        </Button>
      </div>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{draft.id ? 'Sửa dịch vụ' : 'Dịch vụ mới'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Tên"
                value={draft.name}
                onChange={e =>
                  setDraft(d =>
                    d
                      ? {
                          ...d,
                          name: e.target.value,
                          slug: d.id ? d.slug : slugify(e.target.value),
                        }
                      : d,
                  )
                }
                required
              />
              <Input label="Slug" value={draft.slug} onChange={set('slug')} required />
              <div className="sm:col-span-2">
                <Input
                  label="Mô tả"
                  value={draft.description}
                  onChange={set('description')}
                  required={!draft.id}
                />
              </div>
              <Select
                label="Danh mục"
                value={draft.category_id}
                onChange={set('category_id')}
                options={[
                  { value: '', label: draft.id ? '(giữ nguyên)' : '— Chọn danh mục —' },
                  ...(categories ?? []).map(c => ({ value: c._id, label: c.name })),
                ]}
              />
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Hoặc tạo danh mục mới"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newCategory.trim() || createCategory.isPending}
                  onClick={() =>
                    createCategory.mutate(
                      { name: newCategory.trim(), slug: slugify(newCategory) },
                      {
                        onSuccess: res => {
                          setNewCategory('');
                          const created = (res.data as { data?: { _id: string } }).data;
                          if (created?._id)
                            setDraft(d => (d ? { ...d, category_id: created._id } : d));
                        },
                      },
                    )
                  }
                >
                  Tạo
                </Button>
              </div>
              <Input
                label="Giá thấp nhất (₫)"
                type="number"
                min={0}
                value={draft.price_range_min}
                onChange={set('price_range_min')}
              />
              <Input
                label="Giá cao nhất (₫)"
                type="number"
                min={0}
                value={draft.price_range_max}
                onChange={set('price_range_max')}
              />
              <Input
                label="Phí nền tảng (%)"
                type="number"
                min={0}
                max={50}
                value={draft.platform_fee_percent}
                onChange={set('platform_fee_percent')}
              />
              {(save.error || createCategory.error) && (
                <p className="text-sm text-destructive sm:col-span-2">
                  {errorMessage(save.error || createCategory.error)}
                </p>
              )}
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  type="submit"
                  disabled={save.isPending || (!draft.id && !draft.category_id)}
                >
                  {save.isPending ? 'Đang lưu…' : 'Lưu'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Hủy
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        {isLoading ? (
          <Loading />
        ) : !services?.length ? (
          <EmptyState message="Chưa có dịch vụ nào" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dịch vụ</TableHead>
                <TableHead>Khoảng giá</TableHead>
                <TableHead>Phí</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map(s => (
                <TableRow key={s._id}>
                  <TableCell>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.category_id?.name ?? 'Chưa có danh mục'} · {s.slug}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatVND(s.price_range_min ?? 0)} – {formatVND(s.price_range_max ?? 0)}
                  </TableCell>
                  <TableCell className="text-sm">{s.platform_fee_percent ?? 15}%</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>
                      {s.status === 'active' ? 'Đang bật' : 'Đã tắt'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => edit(s)}>
                        Sửa
                      </Button>
                      <Button
                        size="sm"
                        variant={s.status === 'active' ? 'ghost' : 'secondary'}
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({
                            id: s._id,
                            status: s.status === 'active' ? 'inactive' : 'active',
                          })
                        }
                      >
                        {s.status === 'active' ? 'Tắt' : 'Bật'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
