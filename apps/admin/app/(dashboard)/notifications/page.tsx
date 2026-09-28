'use client';

import { useState } from 'react';
import { useBroadcast } from '@/hooks/use-admin';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui';

export default function BroadcastPage() {
  const broadcast = useBroadcast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('Gửi thông báo này tới TẤT CẢ người dùng?')) return;
    broadcast.mutate(
      { title: title.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setTitle('');
          setBody('');
        },
      },
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gửi thông báo</h1>
        <p className="text-muted-foreground">
          Thông báo hệ thống hiển thị trong mục Thông báo của mọi người dùng
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nội dung</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Tiêu đề"
              value={title}
              maxLength={120}
              onChange={e => setTitle(e.target.value)}
              required
            />
            <div className="space-y-1">
              <label htmlFor="body" className="text-sm font-medium leading-none">
                Nội dung
              </label>
              <textarea
                id="body"
                value={body}
                maxLength={1000}
                onChange={e => setBody(e.target.value)}
                required
                rows={5}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {broadcast.isSuccess && (
              <p className="text-sm text-green-600">Đã gửi tới {broadcast.data.sent} người dùng.</p>
            )}
            {broadcast.isError && (
              <p className="text-sm text-destructive">Gửi thất bại, thử lại sau.</p>
            )}
            <Button type="submit" disabled={broadcast.isPending || !title.trim() || !body.trim()}>
              {broadcast.isPending ? 'Đang gửi…' : 'Gửi tới tất cả'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
