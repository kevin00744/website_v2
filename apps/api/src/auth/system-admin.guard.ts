import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../common/errors/app-error';
import { isSystemAdmin } from './role-access.util';
import type { AuthenticatedUser } from './types';

/**
 * 只放行 system_admin（RolesGuard 會讓 admin 一併通過，測試中的功能不能只靠它擋）。
 * 搭配 JwtAuthGuard 使用：@UseGuards(JwtAuthGuard, SystemAdminGuard)
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>().user;
    if (actor && isSystemAdmin(actor)) return true;
    throw new AppError('PERMISSION_DENIED', 'system_admin only', 403);
  }
}
