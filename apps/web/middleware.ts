import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 沒有登入 token 一律導去 /login；細部角色權限（dealer/manager 各自能看什麼資料）由後端 API 把關，
 * 這裡只擋兩件事：完全沒登入，以及分店管理這種「連畫面都不該被非管理員看到」的頁面。
 *
 * /admin 是後台的歡迎首頁：登入成功、或已登入卻打 /login，都會導到這裡（不是 /customers）；
 * 沒登入直接打 /admin 一樣會被上面那條「沒有 token 一律導去 /login」的規則擋下來。
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get('wv2_token')?.value;
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  if (token && request.nextUrl.pathname.startsWith('/stores')) {
    const role = readRoleFromCookie(request);
    // 對齊後端 StoresController 的 @Roles('dealer', 'manager')（admin/system_admin 透過 isAdminRole 超集放行）：
    // dealer 也能進分店管理頁面（建店/查清單時自動鎖定在自己負責的區域，manager 不開放）。
    if (role !== 'admin' && role !== 'system_admin' && role !== 'dealer' && role !== 'general_agent') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (token && request.nextUrl.pathname.startsWith('/users')) {
    const role = readRoleFromCookie(request);
    if (role !== 'admin' && role !== 'system_admin' && role !== 'dealer' && role !== 'general_agent') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (token && request.nextUrl.pathname.startsWith('/chat-contacts')) {
    const role = readRoleFromCookie(request);
    // 對齊後端 ChatController 的 contact-permissions 系列路由 @Roles('system_admin')：只有 admin/system_admin 能調整別人的聊天清單
    if (role !== 'admin' && role !== 'system_admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (token && request.nextUrl.pathname.startsWith('/products')) {
    const role = readRoleFromCookie(request);
    // 對齊後端 ProductsController 的 @Roles('system_admin')：只有 admin/system_admin 能管理商品目錄
    if (role !== 'admin' && role !== 'system_admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (token && request.nextUrl.pathname.startsWith('/contact-categories')) {
    const role = readRoleFromCookie(request);
    // 對齊後端 ContactController 的 admin/categories 路由 @Roles('system_admin')：只有 admin/system_admin 能管理詢問類別
    if (role !== 'admin' && role !== 'system_admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (token && request.nextUrl.pathname.startsWith('/contact-messages')) {
    const role = readRoleFromCookie(request);
    // 對齊後端 ContactController 的 admin/messages 路由：admin/system_admin/dealer/manager 都能進來（範圍各自限縮）
    if (role !== 'admin' && role !== 'system_admin' && role !== 'dealer' && role !== 'general_agent' && role !== 'manager') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (token && request.nextUrl.pathname.startsWith('/line')) {
    const role = readRoleFromCookie(request);
    // LINE 頁：除了會計以外都能進（對齊後端 LineAdminController 的 @Roles('staff', 'manager')）
    if (role === 'accountant') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (token && request.nextUrl.pathname.startsWith('/cms')) {
    const role = readRoleFromCookie(request);
    // 對齊後端 CmsController 的 admin/pages、admin/templates 系列路由 @Roles('admin')：
    // 只有 admin/system_admin 能管理官網頁面跟範本庫（startsWith('/cms') 同時涵蓋 /cms 跟 /cms-templates）
    if (role !== 'admin' && role !== 'system_admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return NextResponse.next();
}

function readRoleFromCookie(request: NextRequest): string | undefined {
  const raw = request.cookies.get('wv2_user')?.value;
  if (!raw) return undefined;
  try {
    return (JSON.parse(decodeURIComponent(raw)) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

export const config = {
  matcher: [
    '/admin',
    '/customers/:path*',
    '/calendar/:path*',
    '/consent-templates/:path*',
    '/inventory/:path*',
    '/stores/:path*',
    '/products/:path*',
    '/contact-categories/:path*',
    '/contact-messages/:path*',
    '/users/:path*',
    '/chat-contacts/:path*',
    '/cms/:path*',
    '/cms-templates/:path*',
    '/cms-articles/:path*',
    '/settings/:path*',
    '/line/:path*',
    '/line-test/:path*',
    '/login',
  ],
};
