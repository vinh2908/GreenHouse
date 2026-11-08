'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore(s => s.login);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(phone, password);
      router.push('/');
    } catch (err: any) {
      const serverMsg = err?.response?.data?.message;
      const msg =
        (Array.isArray(serverMsg) ? serverMsg.join(', ') : serverMsg) ||
        (err instanceof Error ? err.message : 'Đăng nhập thất bại');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Green House Admin Portal"
            className="mx-auto h-14 w-auto mb-3"
          />
          <p className="text-sm text-muted-foreground">Đăng nhập vào hệ thống quản trị</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="phone"
              label="Số điện thoại"
              type="tel"
              placeholder="09xxxxxxxx"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
            {/* B26: nút con mắt hiện/ẩn mật khẩu như bản app */}
            <div className="relative">
              <Input
                id="password"
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2.5 bottom-2 p-1 rounded text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" loading={loading}>
              Đăng nhập
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
