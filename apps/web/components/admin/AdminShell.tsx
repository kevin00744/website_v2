'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getAuthUser, type AuthUser } from '@/lib/auth';
import { NAVIGATION_CONFIG } from '@/lib/navigationConfig';
import { KioskButton } from './kiosk/KioskButton';
import { AccountSwitcher } from './AccountSwitcher';
import { InstallHint } from './InstallHint';
import { TextSizeButton, TextSizeControl } from './TextSizeControl';

const ROLE_LABEL: Record<AuthUser['role'], string> = {
  system_admin: '系統管理員',
  admin: '管理員',
  manager: '店長',
  accountant: '會計',
  staff: '服務人員',
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [user, setUser] = useState<AuthUser>();
  const pathname = usePathname();

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  // close mobile nav when route changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const navItems = user
    ? NAVIGATION_CONFIG.filter((item) => !item.roleGuard || item.roleGuard(user.role))
    : [];

  // 登入頁不套後台外框（否則左邊會多一條空白側欄）
  if (pathname === '/login') return <>{children}</>;

  function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
    const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
    return (
      <a
        href={href}
        className={`flex min-h-kiosk-sm items-center gap-3 rounded-kiosk px-4 text-kiosk-base font-semibold transition-colors
          ${active
            ? 'bg-kiosk-primary text-white'
            : 'text-slate-600 hover:bg-kiosk-primary/10 hover:text-kiosk-primary'
          }`}
      >
        <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
        {label}
      </a>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 md:flex-row">
      {/* 桌機側欄 */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white md:shadow-sm">
        {/* 品牌標題 */}
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-kiosk-lg font-bold text-kiosk-primary">璨妍管理後台</div>
          {user && (
            <div className="mt-1 text-sm text-slate-400">{ROLE_LABEL[user.role]}</div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <div className="border-t border-slate-100 px-4 pt-4">
          <TextSizeControl />
        </div>

        {user && (
          <div className="p-4 pb-safe">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kiosk-primary/10 text-kiosk-base font-bold text-kiosk-primary">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-kiosk-base font-semibold text-slate-800">{user.name}</div>
                {user.email && <div className="truncate text-sm text-slate-400">{user.email}</div>}
              </div>
            </div>
            <KioskButton variant="secondary" fullWidth onClick={() => setSwitcherOpen(true)}>
              帳號管理 / 登出
            </KioskButton>
          </div>
        )}
      </aside>

      {/* 手機頂部列 */}
      <header className="pt-safe sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 pb-3 shadow-sm md:hidden">
        <span className="pt-3 text-kiosk-base font-bold text-kiosk-primary">璨妍管理後台</span>
        <div className="flex items-center gap-1 pt-3">
          <TextSizeButton />
          <button
            type="button"
            aria-label="開啟選單"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-kiosk text-2xl text-slate-600 hover:bg-slate-100"
          >
            ☰
          </button>
        </div>
      </header>

      {/* 手機側滑抽屜 */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          {/* 半透明遮罩 */}
          <div className="absolute inset-0 bg-black/40" />

          {/* 抽屜主體 */}
          <div
            className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="text-kiosk-base font-bold text-kiosk-primary">璨妍管理後台</div>
                {user && <div className="text-sm text-slate-400">{ROLE_LABEL[user.role]}</div>}
              </div>
              <button
                type="button"
                aria-label="關閉選單"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-kiosk text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
              {navItems.map((item) => {
                const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-kiosk items-center gap-3 rounded-kiosk px-5 text-kiosk-base font-semibold transition-colors
                      ${active
                        ? 'bg-kiosk-primary text-white'
                        : 'text-slate-700 hover:bg-kiosk-primary/10'
                      }`}
                  >
                    <span className="text-xl leading-none" aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </a>
                );
              })}
            </nav>

            {user && (
              <div className="border-t border-slate-100 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kiosk-primary/10 text-kiosk-base font-bold text-kiosk-primary">
                    {user.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">{user.name}</div>
                    {user.email && <div className="truncate text-sm text-slate-400">{user.email}</div>}
                  </div>
                </div>
                <KioskButton variant="secondary" fullWidth onClick={() => { setMobileNavOpen(false); setSwitcherOpen(true); }}>
                  帳號管理 / 登出
                </KioskButton>
              </div>
            )}
          </div>
        </div>
      )}

      <AccountSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      <main className="flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
        <InstallHint className="mb-5" />
        {children}
      </main>
    </div>
  );
}
