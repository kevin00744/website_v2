import { Injectable } from '@nestjs/common';
import type { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LineMessagingService } from './line-messaging.service';
import { appointmentStatusMessage } from './line-flex';
import { readLineConfig } from './line.config';

/**
 * 預約狀態變更時通知已綁定 LINE 的顧客。只通知 LINE 來源的預約（測試期不影響一般預約）。
 * 由 AppointmentsService 呼叫，失敗不影響主流程。
 */
@Injectable()
export class LineNotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LineMessagingService,
  ) {}

  async notifyAppointmentStatus(appointmentId: number, status: AppointmentStatus): Promise<void> {
    if (status !== 'confirmed' && status !== 'cancelled') return;
    if (!readLineConfig().enabled) return;
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        source: true,
        startAt: true,
        serviceItem: { select: { name: true } },
        staff: { select: { name: true } },
        customer: { select: { lineAccount: { select: { lineUserId: true } } } },
      },
    });
    const lineUserId = appt?.customer?.lineAccount?.lineUserId;
    if (!appt || appt.source !== 'line' || !lineUserId) return;
    await this.messaging.push(lineUserId, [
      appointmentStatusMessage(status, appt.startAt, appt.serviceItem?.name ?? null, appt.staff?.name ?? null),
    ]);
  }
}
