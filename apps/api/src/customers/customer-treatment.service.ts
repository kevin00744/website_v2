import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { generateUploadFileName, saveUploadFile } from '../common/upload.util';
import type { AuthenticatedUser } from '../auth/types';

@Injectable()
export class CustomerTreatmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listRecords(actor: AuthenticatedUser, customerId: number) {
    await this.assertCustomerAccess(actor, customerId);
    const records = await this.prisma.customerTreatmentRecord.findMany({
      where: { customerId },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: { performedAt: 'desc' },
    });
    return records.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      product: r.product,
      performedBy: r.performedBy,
      performedAt: r.performedAt.toISOString(),
      note: r.note,
      photos: r.photos as string[],
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createRecord(
    actor: AuthenticatedUser,
    customerId: number,
    input: { productId: number; note?: string; performedAt?: string },
  ) {
    await this.assertCustomerAccess(actor, customerId);

    const product = await this.prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', '找不到該商品', 404);

    const record = await this.prisma.customerTreatmentRecord.create({
      data: {
        customerId,
        productId: input.productId,
        performedById: actor.id,
        performedAt: input.performedAt ? new Date(input.performedAt) : new Date(),
        note: input.note ?? null,
        photos: [],
      },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        performedBy: { select: { id: true, name: true } },
      },
    });
    return this.toDto(record);
  }

  async uploadPhotos(actor: AuthenticatedUser, customerId: number, recordId: number, files: Buffer[]) {
    await this.assertCustomerAccess(actor, customerId);
    const record = await this.prisma.customerTreatmentRecord.findFirst({ where: { id: recordId, customerId } });
    if (!record) throw new AppError('TREATMENT_RECORD_NOT_FOUND', '找不到此療程紀錄', 404);

    const urls: string[] = [];
    for (const buf of files) {
      const fileName = generateUploadFileName('photo.jpg');
      await saveUploadFile(fileName, buf);
      urls.push(`/api/v2/uploads/${fileName}`);
    }

    const existing = record.photos as string[];
    const updated = await this.prisma.customerTreatmentRecord.update({
      where: { id: recordId },
      data: { photos: [...existing, ...urls] },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        performedBy: { select: { id: true, name: true } },
      },
    });
    return this.toDto(updated);
  }

  async deleteRecord(actor: AuthenticatedUser, customerId: number, recordId: number) {
    await this.assertCustomerAccess(actor, customerId);
    const record = await this.prisma.customerTreatmentRecord.findFirst({ where: { id: recordId, customerId } });
    if (!record) throw new AppError('TREATMENT_RECORD_NOT_FOUND', '找不到此療程紀錄', 404);
    await this.prisma.customerTreatmentRecord.delete({ where: { id: recordId } });
  }

  private toDto(r: {
    id: number;
    customerId: number;
    product: { id: number; sku: string; name: string; unit: string | null };
    performedBy: { id: number; name: string };
    performedAt: Date;
    note: string | null;
    photos: unknown;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      customerId: r.customerId,
      product: r.product,
      performedBy: r.performedBy,
      performedAt: r.performedAt.toISOString(),
      note: r.note,
      photos: r.photos as string[],
      createdAt: r.createdAt.toISOString(),
    };
  }

  /** manager 只能存取自己店的顧客；dealer 可以存取自己區域的顧客；admin/system_admin 全部可見 */
  private async assertCustomerAccess(actor: AuthenticatedUser, customerId: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null }, include: { store: true } });
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', '找不到此顧客', 404);

    if (actor.role === 'system_admin' || actor.role === 'admin') return;
    if (actor.role === 'dealer' || actor.role === 'general_agent') {
      if (actor.region && customer.store.region !== actor.region) {
        throw new AppError('FORBIDDEN', '無法存取其他區域的顧客資料', 403);
      }
      return;
    }
    if (actor.role === 'manager' || actor.role === 'staff') {
      if (actor.storeId && customer.storeId !== actor.storeId) {
        throw new AppError('FORBIDDEN', '無法存取其他分店的顧客資料', 403);
      }
      return;
    }
    throw new AppError('FORBIDDEN', '無權限存取顧客資料', 403);
  }
}
