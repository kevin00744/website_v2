import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** system_admin/admin 永遠視為「管理員」超集，RolesGuard 會自動放行，不需要每處都列出來 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
