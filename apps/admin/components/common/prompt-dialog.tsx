'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui';

// B106: dialog hệ thống thay cho prompt()/confirm() của trình duyệt —
// dùng chung cho mọi chỗ admin cần nhập lý do hoặc xác nhận hành động.
export function PromptDialog({
  title,
  message,
  label,
  placeholder,
  confirmLabel = 'Xác nhận',
  requireInput = true,
  onSubmit,
  onClose,
}: {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  requireInput?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold">{title}</h3>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {label ? (
          <Input
            label={label}
            placeholder={placeholder}
            value={value}
            onChange={e => setValue(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && (!requireInput || value.trim())) onSubmit(value.trim());
              if (e.key === 'Escape') onClose();
            }}
          />
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={requireInput && label !== undefined && !value.trim()}
            onClick={() => onSubmit(value.trim())}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
