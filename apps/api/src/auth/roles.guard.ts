import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../common/errors/app-error';
import { ROLES_KEY } from './roles.decorator';
import { isAdminRole } from './role-access.util';
import type { AuthenticatedUser } from './types';

/**
 * 跟 JwtAuthGuard 搭配使用，必須先驗證過 JWT（req.user 已存在）才會跑到這裡。
 * system_admin/admin 一律放行（沿用 Version 1 isAdmin() 的超集語意），
 * 其餘角色必須出現在 @Roles(...) 指定的清單裡才能通過。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const actor = request.user;

    if (isAdminRole(actor.role) || requiredRoles.includes(actor.role)) {
      return true;
    }

    throw new AppError('PERMISSION_DENIED', `role ${actor.role} not allowed`, 403);
  }
}
