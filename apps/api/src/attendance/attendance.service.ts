import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { AuthenticatedUser } from '../auth/types';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 上班打卡。允許同一天多次打卡（例如午休後重新打卡），
   * 但若目前有尚未下班的紀錄則擋下，避免 open clock 重疊。
   */
  async checkIn(actor: AuthenticatedUser) {
    const storeId = this.requireStoreId(actor);

    const openClock = await this.prisma.attendanceLog.findFirst({
      where: { userId: actor.id, storeId, clockOutAt: null },
    });
    if (openClock) {
      throw new AppError('ATTENDANCE_ALREADY_CLOCKED_IN', '您目前有尚未結束的班次，請先打下班卡', 409);
    }

    return this.prisma.attendanceLog.create({
      data: { userId: actor.id, storeId, clockInAt: new Date() },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  /**
   * 下班打卡：找到該員工在同分店最新一筆 open clock 並填入 clockOutAt。
   */
  async checkOut(actor: AuthenticatedUser) {
    const storeId = this.requireStoreId(actor);

    const openClock = await this.prisma.attendanceLog.findFirst({
      where: { userId: actor.id, storeId, clockOutAt: null },
      orderBy: { clockInAt: 'desc' },
    });
    if (!openClock) {
      throw new AppError('ATTENDANCE_NOT_CLOCKED_IN', '找不到您尚未結束的班次，請先打上班卡', 404);
    }

    return this.prisma.attendanceLog.update({
      where: { id: openClock.id },
      data: { clockOutAt: new Date() },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  /** 查詢自己的打卡紀錄（分頁，最近 30 筆）。staff 只能看自己；manager/admin 可看整個分店。 */
  async listRecords(actor: AuthenticatedUser, targetUserId?: number) {
    const storeId = this.requireStoreId(actor);
    const isManagerOrAbove = actor.role === 'manager' || actor.role === 'dealer' || actor.role === 'system_admin' || actor.role === 'admin';

    // staff 只能看自己
    const userId = (!isManagerOrAbove || !targetUserId) ? actor.id : targetUserId;

    const logs = await this.prisma.attendanceLog.findMany({
      where: { storeId, userId },
      orderBy: { clockInAt: 'desc' },
      take: 60,
      include: { user: { select: { id: true, name: true } } },
    });

    return logs.map((l) => ({
      id: l.id,
      user: l.user,
      storeId: l.storeId,
      clockInAt: l.clockInAt.toISOString(),
      clockOutAt: l.clockOutAt?.toISOString() ?? null,
      note: l.note,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  /** 查詢分店目前所有 open clock（未下班的員工），供店長一覽 */
  async listOpenClocks(actor: AuthenticatedUser) {
    const storeId = this.requireStoreId(actor);
    const logs = await this.prisma.attendanceLog.findMany({
      where: { storeId, clockOutAt: null },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { clockInAt: 'asc' },
    });
    return logs.map((l) => ({
      id: l.id,
      user: l.user,
      clockInAt: l.clockInAt.toISOString(),
    }));
  }

  /**
   * 分店員工本月考勤摘要（manager 用），回傳每位員工的累計上班天數與總工時（分鐘）。
   * month 格式：YYYY-MM，不傳則預設當月。
   */
  async monthlySummary(actor: AuthenticatedUser, storeId: number, month?: string) {
    const storeId_ = actor.storeId ?? storeId;
    // manager 只能看自己的分店
    if (actor.role === 'manager' && actor.storeId !== storeId) {
      throw new AppError('PERMISSION_DENIED', '只能查看自己所屬分店的考勤', 403);
    }

    const now = new Date();
    const target = month ? new Date(`${month}-01`) : new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStart = new Date(target.getFullYear(), target.getMonth(), 1);
    const monthEnd = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999);

    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        storeId: storeId_,
        clockInAt: { gte: monthStart, lte: monthEnd },
      },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { clockInAt: 'asc' },
    });

    // 按員工分組計算
    const staffMap = new Map<number, { user: { id: number; name: string; role: string }; daysWorked: Set<string>; totalMinutes: number }>();
    for (const log of logs) {
      if (!staffMap.has(log.userId)) {
        staffMap.set(log.userId, { user: log.user, daysWorked: new Set(), totalMinutes: 0 });
      }
      const entry = staffMap.get(log.userId)!;
      const dayKey = log.clockInAt.toISOString().slice(0, 10);
      entry.daysWorked.add(dayKey);
      if (log.clockOutAt) {
        entry.totalMinutes += Math.round((log.clockOutAt.getTime() - log.clockInAt.getTime()) / 60000);
      }
    }

    return Array.from(staffMap.values()).map((e) => ({
      user: e.user,
      daysWorked: e.daysWorked.size,
      totalMinutes: e.totalMinutes,
    }));
  }

  private requireStoreId(actor: AuthenticatedUser): number {
    if (!actor.storeId) {
      throw new AppError('ATTENDANCE_NO_STORE', '您的帳號未指定所屬分店，無法打卡', 400);
    }
    return actor.storeId;
  }
}
