import { Injectable } from '@nestjs/common';
import type { InquiryCategoryKind, Region } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';

/**
 * 跟 packages/shared-types/contact.ts 的 TAIWAN_CITY_REGION 是同一份資料，故意在後端重複宣告
 * 一份而不是 import 共用套件——這個專案的慣例是後端不依賴任何 @website-v2/* 前端取向的套件
 * （參考 PageContent 故意不 import @puckeditor/core 的理由），這份資料本身很小、很少變動，
 * 重複宣告的維護成本遠低於額外拉一條跨套件依賴的成本。
 */
const TAIWAN_CITY_REGION: Record<string, Region> = {
  台北市: 'A',
  新北市: 'A',
  桃園市: 'A',
  新竹市: 'A',
  新竹縣: 'A',
  基隆市: 'A',
  宜蘭縣: 'A',
  台中市: 'B',
  苗栗縣: 'B',
  彰化縣: 'B',
  南投縣: 'B',
  雲林縣: 'B',
  嘉義市: 'C',
  嘉義縣: 'C',
  台南市: 'C',
  高雄市: 'C',
  屏東縣: 'C',
  澎湖縣: 'C',
  台東縣: 'C',
  花蓮縣: 'C',
  金門縣: 'C',
  連江縣: 'C',
};

export interface SubmitContactMessageInput {
  name: string;
  phone?: string;
  email?: string;
  city: string;
  categoryId: number;
  message?: string;
}

export interface CreateInquiryCategoryInput {
  name: string;
  kind?: InquiryCategoryKind;
}

export interface UpdateInquiryCategoryInput {
  name?: string;
  kind?: InquiryCategoryKind;
  isActive?: boolean;
  sortOrder?: number;
}

export interface InquiryCategorySummary {
  id: number;
  name: string;
  kind: InquiryCategoryKind;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface ContactCategoryOption {
  id: number;
  name: string;
}

export interface ContactMessageSummary {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  region: Region;
  message: string | null;
  categoryId: number;
  categoryName: string;
  categoryKind: InquiryCategoryKind;
  storeId: number | null;
  storeName: string | null;
  forwardedAt: string | null;
  forwardedByName: string | null;
  isHandled: boolean;
  createdAt: string;
}

const MESSAGE_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  city: true,
  region: true,
  message: true,
  categoryId: true,
  category: { select: { name: true, kind: true } },
  storeId: true,
  store: { select: { name: true } },
  forwardedAt: true,
  forwarder: { select: { name: true } },
  isHandled: true,
  createdAt: true,
} as const;

type MessageRow = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  region: Region;
  message: string | null;
  categoryId: number;
  category: { name: string; kind: InquiryCategoryKind };
  storeId: number | null;
  store: { name: string } | null;
  forwardedAt: Date | null;
  forwarder: { name: string } | null;
  isHandled: boolean;
  createdAt: Date;
};

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}

  /** 前台表單下拉選單用，只回上架中的類別，依排序顯示 */
  async listPublicCategories(): Promise<ContactCategoryOption[]> {
    const categories = await this.prisma.inquiryCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return categories;
  }

  /**
   * 訪客送出「聯絡我們」表單：city 換算成 region 存起來，分派邏輯（dealer/manager 查得到哪些訊息）
   * 一律比對 region，不是比對 city 字串——這支完全公開、不需要登入。
   */
  async submitMessage(input: SubmitContactMessageInput): Promise<void> {
    const name = input.name?.trim();
    if (!name) {
      throw new AppError('CONTACT_NAME_REQUIRED', 'name is required', 400);
    }
    const city = input.city?.trim();
    const region = city ? TAIWAN_CITY_REGION[city] : undefined;
    if (!city || !region) {
      throw new AppError('CONTACT_CITY_INVALID', 'city is invalid', 400);
    }

    const category = await this.prisma.inquiryCategory.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) {
      throw new AppError('CONTACT_CATEGORY_NOT_FOUND', 'selected category does not exist', 404);
    }

    await this.prisma.contactMessage.create({
      data: {
        name,
        phone: input.phone,
        email: input.email,
        city,
        region,
        message: input.message,
        categoryId: category.id,
      },
    });
  }

  /** 後台「詢問類別管理」用：列出全部（含下架），admin/system_admin 才能呼叫 */
  async listCategoriesForAdmin(): Promise<InquiryCategorySummary[]> {
    const categories = await this.prisma.inquiryCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return categories.map(toCategorySummary);
  }

  async createCategory(input: CreateInquiryCategoryInput): Promise<InquiryCategorySummary> {
    const name = input.name?.trim();
    if (!name) {
      throw new AppError('CONTACT_CATEGORY_NAME_REQUIRED', 'name is required', 400);
    }
    const last = await this.prisma.inquiryCategory.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    const category = await this.prisma.inquiryCategory.create({
      data: { name, kind: input.kind ?? 'other', sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    return toCategorySummary(category);
  }

  async updateCategory(id: number, input: UpdateInquiryCategoryInput): Promise<InquiryCategorySummary> {
    const existing = await this.prisma.inquiryCategory.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('CONTACT_CATEGORY_NOT_FOUND', `category ${id} not found`, 404);
    }
    const category = await this.prisma.inquiryCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
    return toCategorySummary(category);
  }

  /** 硬刪除：類別底下如果已經有訊息會被擋下（避免訊息變成沒有類別可以歸屬），要刪的話先把訊息處理掉或改類別 */
  async deleteCategory(id: number): Promise<void> {
    const existing = await this.prisma.inquiryCategory.findUnique({ where: { id }, include: { _count: { select: { messages: true } } } });
    if (!existing) {
      throw new AppError('CONTACT_CATEGORY_NOT_FOUND', `category ${id} not found`, 404);
    }
    if (existing._count.messages > 0) {
      throw new AppError('CONTACT_CATEGORY_IN_USE', `category ${id} still has messages attached`, 409);
    }
    await this.prisma.inquiryCategory.delete({ where: { id } });
  }

  /**
   * 後台「聯絡訊息」清單：admin/system_admin 看全部；dealer 只看「自己負責區域」的訊息
   * （加盟跟體驗兩種類別都看得到——加盟由經銷商直接處理，體驗由經銷商決定要不要轉給分店）；
   * manager 只看「已經轉給自己分店」的體驗諮詢，在訊息被轉之前完全看不到。
   */
  async listMessages(actor: AuthenticatedUser, isHandled?: boolean): Promise<ContactMessageSummary[]> {
    const where: Record<string, unknown> = {
      ...(isHandled !== undefined ? { isHandled } : {}),
    };

    if (actor.role === 'dealer' || actor.role === 'general_agent') {
      if (!actor.region) return [];
      where.region = actor.region;
    } else if (actor.role === 'manager') {
      if (!actor.storeId) return [];
      where.storeId = actor.storeId;
    } else if (!isAdminRole(actor.role)) {
      return [];
    }

    const messages = await this.prisma.contactMessage.findMany({
      where,
      select: MESSAGE_SELECT,
      orderBy: [{ isHandled: 'asc' }, { createdAt: 'desc' }],
    });
    return messages.map(toMessageSummary);
  }

  /**
   * 經銷商把體驗諮詢轉給特定分店：只能轉「自己區域」的訊息（admin 不受限），且只能轉
   * kind = experience 的類別——加盟諮詢本來就是經銷商自己處理，沒有「轉給分店」這個動作。
   */
  async forwardMessage(actor: AuthenticatedUser, id: number, storeId: number): Promise<ContactMessageSummary> {
    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
      select: { id: true, region: true, category: { select: { kind: true } } },
    });
    if (!existing) {
      throw new AppError('CONTACT_MESSAGE_NOT_FOUND', `contact message ${id} not found`, 404);
    }
    if ((actor.role === 'dealer' || actor.role === 'general_agent') && existing.region !== actor.region) {
      throw new AppError('CONTACT_MESSAGE_NOT_FOUND', `contact message ${id} not visible to actor ${actor.id}`, 404);
    }
    if (existing.category.kind !== 'experience') {
      throw new AppError('CONTACT_MESSAGE_NOT_FORWARDABLE', 'only experience inquiries can be forwarded to a store', 400);
    }

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } });
    if (!store) {
      throw new AppError('STORE_NOT_FOUND', 'selected store does not exist', 404);
    }
    if ((actor.role === 'dealer' || actor.role === 'general_agent') && store.region !== actor.region) {
      throw new AppError('STORE_NOT_IN_REGION', "selected store is outside dealer's region", 403);
    }

    const updated = await this.prisma.contactMessage.update({
      where: { id },
      data: { storeId, forwardedAt: new Date(), forwardedBy: actor.id },
      select: MESSAGE_SELECT,
    });
    return toMessageSummary(updated);
  }

  /** 打勾標記已處理；可見範圍跟 listMessages 同一套規則（manager 只能標記已經轉給自己分店的訊息） */
  async markHandled(actor: AuthenticatedUser, id: number, isHandled: boolean): Promise<ContactMessageSummary> {
    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
      select: { id: true, region: true, storeId: true },
    });
    if (!existing) {
      throw new AppError('CONTACT_MESSAGE_NOT_FOUND', `contact message ${id} not found`, 404);
    }
    if ((actor.role === 'dealer' || actor.role === 'general_agent') && existing.region !== actor.region) {
      throw new AppError('CONTACT_MESSAGE_NOT_FOUND', `contact message ${id} not visible to actor ${actor.id}`, 404);
    }
    if (actor.role === 'manager' && existing.storeId !== actor.storeId) {
      throw new AppError('CONTACT_MESSAGE_NOT_FOUND', `contact message ${id} not visible to actor ${actor.id}`, 404);
    }

    const updated = await this.prisma.contactMessage.update({ where: { id }, data: { isHandled }, select: MESSAGE_SELECT });
    return toMessageSummary(updated);
  }

  /**
   * 硬刪除：ContactMessage 沒有 deletedAt（不像 Customer/Product 那些會被其他紀錄引用的實體），
   * 訊息本身就是一次性的詢問紀錄，刪掉不會留下孤兒關聯，只開放給 admin/system_admin
   * （見 ContactController 的 @Roles('system_admin')），不開放給 dealer/manager。
   */
  async deleteMessage(id: number): Promise<void> {
    const existing = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('CONTACT_MESSAGE_NOT_FOUND', `contact message ${id} not found`, 404);
    }
    await this.prisma.contactMessage.delete({ where: { id } });
  }
}

function toCategorySummary(category: {
  id: number;
  name: string;
  kind: InquiryCategoryKind;
  isActive: boolean;
  sortOrder: number;
  updatedAt: Date;
}): InquiryCategorySummary {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    updatedAt: category.updatedAt.toISOString(),
  };
}

function toMessageSummary(row: MessageRow): ContactMessageSummary {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    city: row.city,
    region: row.region,
    message: row.message,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    categoryKind: row.category.kind,
    storeId: row.storeId,
    storeName: row.store?.name ?? null,
    forwardedAt: row.forwardedAt?.toISOString() ?? null,
    forwardedByName: row.forwarder?.name ?? null,
    isHandled: row.isHandled,
    createdAt: row.createdAt.toISOString(),
  };
}
