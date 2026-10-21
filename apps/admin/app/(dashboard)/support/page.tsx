'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AdminSupportConversation,
  useAdminSupportClose,
  useAdminSupportRead,
  useAdminSupportReply,
  useSupportConversations,
  useSupportThread,
} from '@/hooks/use-admin';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Loading, Select } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

const userName = (c: AdminSupportConversation) =>
  c.user_id && typeof c.user_id === 'object' ? c.user_id.full_name ?? 'Người dùng' : 'Người dùng';
const userPhone = (c: AdminSupportConversation) =>
  c.user_id && typeof c.user_id === 'object' ? c.user_id.phone ?? '' : '';

export default function SupportPage() {
  const [status, setStatus] = useState('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { data: conversations, isLoading } = useSupportConversations(status);
  const list = conversations ?? [];
  const selected = list.find(c => c._id === selectedId) ?? null;

  const { data: messages, isLoading: threadLoading } = useSupportThread(selectedId);
  const reply = useAdminSupportReply();
  const closeConv = useAdminSupportClose();
  const markRead = useAdminSupportRead();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mở thread = đánh dấu đã đọc phía admin
  useEffect(() => {
    if (selectedId && (selected?.unread_for_admin ?? 0) > 0) {
      markRead.mutate(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.unread_for_admin]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length, selectedId]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || !selectedId || reply.isPending) return;
    setDraft('');
    await reply.mutateAsync({ id: selectedId, content }).catch(() => setDraft(content));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Hỗ trợ trực tuyến 💬</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Live chat với người dùng trong app. Danh sách và tin nhắn tự làm mới mỗi 5 giây;
                phản hồi sẽ đẩy thông báo chuông + realtime tới app của người dùng.
              </p>
            </div>
            <div className="w-48">
              <Select
                value={status}
                onChange={e => {
                  setStatus(e.target.value);
                  setSelectedId(null);
                }}
                options={[
                  { value: 'open', label: 'Đang mở' },
                  { value: 'closed', label: 'Đã đóng' },
                  { value: 'all', label: 'Tất cả' },
                ]}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* ── Conversation list ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <Loading />
            ) : list.length === 0 ? (
              <EmptyState message="Chưa có hội thoại hỗ trợ nào." />
            ) : (
              <div className="divide-y max-h-[640px] overflow-y-auto">
                {list.map(c => (
                  <button
                    key={c._id}
                    onClick={() => setSelectedId(c._id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      c._id === selectedId ? 'bg-primary/10' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm truncate">{userName(c)}</span>
                      {c.unread_for_admin > 0 && (
                        <span className="shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold">
                          {c.unread_for_admin}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{userPhone(c)}</p>
                    <p className="text-sm truncate mt-1">{c.last_message || '—'}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {c.last_message_at ? formatDateTime(c.last_message_at) : formatDateTime(c.created_at)}
                      </span>
                      <Badge variant={c.status === 'open' ? 'success' : 'secondary'}>
                        {c.status === 'open' ? 'Đang mở' : 'Đã đóng'}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Thread ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>
                {selected ? `Hội thoại với ${userName(selected)}` : 'Chọn một hội thoại'}
              </CardTitle>
              {selected && selected.status === 'open' && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={closeConv.isPending}
                  onClick={() => closeConv.mutate(selected._id)}
                >
                  Đóng hội thoại
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <EmptyState message="Chọn một hội thoại ở cột trái để xem và phản hồi." />
            ) : threadLoading ? (
              <Loading />
            ) : (
              <div className="space-y-4">
                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {(messages ?? []).map(m => {
                    const isAdmin = m.sender_role === 'admin';
                    return (
                      <div key={m._id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                            isAdmin
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-muted rounded-bl-sm'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                          <p
                            className={`text-[11px] mt-1 ${
                              isAdmin ? 'text-primary-foreground/70' : 'text-muted-foreground'
                            }`}
                          >
                            {isAdmin ? 'Đội hỗ trợ' : userName(selected!)} ·{' '}
                            {formatDateTime(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {selected?.status === 'closed' ? (
                  <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
                    Hội thoại đã đóng. Người dùng gửi tin nhắn mới sẽ tạo hội thoại mới.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Nhập phản hồi cho người dùng..."
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleSend();
                      }}
                    />
                    <Button onClick={() => void handleSend()} loading={reply.isPending} disabled={!draft.trim()}>
                      Gửi
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
