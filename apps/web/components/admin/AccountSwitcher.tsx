'use client';

import { useEffect, useState } from 'react';
import { ROLE_LABEL } from '@website-v2/shared-types';
import { getAuthUser, saveAuth, clearAuth, type AuthUser } from '@/lib/auth';
import { getSavedAccounts, validatePin, saveAccount, type SavedAccount } from '@/lib/multi-account';
import { login } from '@/lib/auth-api';
import { ApiError } from '@/lib/api-client';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { PinPad } from '@/components/admin/kiosk/PinPad';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';

interface AccountSwitcherProps {
  open: boolean;
  onClose: () => void;
}

type View = 'list' | 'pin' | 'login' | 'logout-confirm';

export function AccountSwitcher({ open, onClose }: AccountSwitcherProps) {
  const [currentUser, setCurrentUser] = useState<AuthUser>();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [view, setView] = useState<View>('list');
  const [pinTarget, setPinTarget] = useState<SavedAccount | null>(null);
  const [pinError, setPinError] = useState<string>();

  // 新帳號登入
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string>();
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const user = getAuthUser();
    setCurrentUser(user ?? undefined);
    setAccounts(getSavedAccounts());
    setView('list');
    setPinTarget(null);
    setPinError(undefined);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError(undefined);
  }, [open]);

  const others = accounts.filter((a) => a.user.id !== currentUser?.id);

  function handleSelectAccount(account: SavedAccount) {
    setPinTarget(account);
    setPinError(undefined);
    setView('pin');
  }

  function handlePinComplete(pin: string) {
    if (!pinTarget) return;
    const verified = validatePin(pinTarget.user.id, pin);
    if (!verified) {
      setPinError('PIN 錯誤，請重試');
      return;
    }
    saveAuth(verified.token, verified.user);
    window.location.href = '/admin';
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(undefined);
    setLoginSubmitting(true);
    try {
      const result = await login(loginUsername.trim(), loginPassword);
      // 若有 PIN 設定，儲存此帳號供下次快速切換
      const existing = getSavedAccounts().find((a) => a.user.id === result.user.id);
      if (existing) {
        saveAccount(result.accessToken, result.user as AuthUser, existing.pin);
      }
      saveAuth(result.accessToken, result.user as AuthUser);
      window.location.href = '/admin';
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : '登入失敗，請稍後再試');
    } finally {
      setLoginSubmitting(false);
    }
  }

  function handleLogout() {
    clearAuth();
    window.location.href = '/login';
  }

  return (
    <CenteredModal open={open} onClose={onClose} title="帳號管理" maxWidthClassName="md:max-w-sm">
      {view === 'pin' && pinTarget && (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="text-center">
            <p className="font-bold text-slate-900">{pinTarget.user.name}</p>
            <p className="text-sm text-slate-500">{(ROLE_LABEL as Record<string, string>)[pinTarget.user.role] ?? pinTarget.user.role}</p>
          </div>
          <PinPad
            title="輸入 4 位數 PIN"
            error={pinError}
            onComplete={handlePinComplete}
            onCancel={() => { setPinTarget(null); setPinError(undefined); setView('list'); }}
          />
          <KioskButton variant="ghost" fullWidth onClick={() => { setPinTarget(null); setPinError(undefined); setView('list'); }}>
            返回
          </KioskButton>
        </div>
      )}

      {view === 'login' && (
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">輸入其他帳號的帳號密碼以切換</p>
          <KioskInput
            label="帳號"
            type="text"
            required
            autoComplete="username"
            placeholder="請輸入登入帳號"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
          />
          <KioskInput
            label="密碼"
            type="password"
            required
            autoComplete="current-password"
            placeholder="請輸入密碼"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
          />
          {loginError && (
            <p className="text-sm font-semibold text-kiosk-danger">⚠️ {loginError}</p>
          )}
          <KioskButton type="submit" variant="primary" fullWidth disabled={loginSubmitting}>
            {loginSubmitting ? '登入中…' : '登入並切換'}
          </KioskButton>
          <KioskButton type="button" variant="ghost" fullWidth onClick={() => setView('list')}>
            返回
          </KioskButton>
        </form>
      )}

      {view === 'logout-confirm' && (
        <div className="flex flex-col gap-4 py-2">
          <p className="text-center text-sm text-slate-600">確定要登出目前帳號嗎？</p>
          <KioskButton variant="danger" fullWidth onClick={handleLogout}>
            確定登出
          </KioskButton>
          <KioskButton variant="ghost" fullWidth onClick={() => setView('list')}>
            取消
          </KioskButton>
        </div>
      )}

      {view === 'list' && (
        <div className="flex flex-col gap-3">
          {/* 目前登入帳號 */}
          {currentUser && (
            <div className="flex items-center gap-3 rounded-kiosk bg-kiosk-primary/5 border border-kiosk-primary/20 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kiosk-primary text-white font-bold text-lg">
                {currentUser.name.charAt(0)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-slate-900 truncate">{currentUser.name}</span>
                <span className="text-sm text-slate-500 truncate">
                  {currentUser.username} · {(ROLE_LABEL as Record<string, string>)[currentUser.role] ?? currentUser.role}
                </span>
              </div>
              <span className="ml-auto text-xs text-kiosk-primary font-semibold shrink-0">目前</span>
            </div>
          )}

          {/* 其他已儲存帳號 */}
          {others.length > 0 && (
            <>
              <p className="text-xs text-slate-400 px-1">已儲存的帳號（輸入 PIN 切換）</p>
              {others.map((account) => (
                <button
                  key={account.user.id}
                  type="button"
                  onClick={() => handleSelectAccount(account)}
                  className="flex items-center gap-3 rounded-kiosk border border-slate-200 bg-white px-4 py-3 text-left hover:border-kiosk-primary hover:bg-kiosk-primary/5 transition-colors"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold text-lg">
                    {account.user.name.charAt(0)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-900 truncate">{account.user.name}</span>
                    <span className="text-sm text-slate-500 truncate">
                      {account.user.username} · {(ROLE_LABEL as Record<string, string>)[account.user.role] ?? account.user.role}
                    </span>
                  </div>
                  <span className="ml-auto text-slate-400 shrink-0">▶</span>
                </button>
              ))}
            </>
          )}

          {/* 新帳號登入 */}
          <button
            type="button"
            onClick={() => setView('login')}
            className="flex items-center gap-3 rounded-kiosk border-2 border-dashed border-slate-200 bg-white px-4 py-3 text-left hover:border-kiosk-primary hover:bg-kiosk-primary/5 transition-colors"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 text-xl">
              ＋
            </div>
            <span className="text-sm font-semibold text-slate-600">新帳號登入</span>
          </button>

          {/* 登出 */}
          <div className="border-t border-slate-100 pt-2">
            <KioskButton variant="ghost" fullWidth onClick={() => setView('logout-confirm')}>
              登出目前帳號
            </KioskButton>
          </div>
        </div>
      )}
    </CenteredModal>
  );
}
