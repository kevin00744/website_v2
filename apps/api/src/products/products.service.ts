import { Injectable } from '@nestjs/common';
import type { Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';

export interface CreateProductInput {
  sku: string;
  name: string;
  unit?: string;
  description?: string;
}

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  unit?: string;
  description?: string;
  isActive?: boolean;
}

export interface ProductSummary {
  id: number;
  sku: string;
  name: string;
  unit: string | null;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
}

/**
 * 商品目錄的完整管理（建立/編輯/上下架/刪除），只開放給 admin/system_admin（見 ProductsController
 * 的 @Roles('system_admin')）——跟 InventoryController 的 GET /inventory/products 是兩支不同端點：
 * 那支是給 manager/dealer 選「要補哪個商品」用，只回啟用中的商品，沒有管理功能；這支才是真正的
 * 商品建檔頁面後端，include 停用中的商品，才能讓管理員後續切回啟用。
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(): Promise<ProductSummary[]> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return products.map(toSummary);
  }

  async createProduct(input: CreateProductInput): Promise<ProductSummary> {
    const name = input.name?.trim();
    if (!name) {
      throw new AppError('PRODUCT_NAME_REQUIRED', 'name is required', 400);
    }
    const sku = input.sku?.trim();
    if (!sku) {
      throw new AppError('PRODUCT_SKU_REQUIRED', 'sku is required', 400);
    }

    const existing = await this.prisma.product.findFirst({ where: { sku, deletedAt: null } });
    if (existing) {
      throw new AppError('PRODUCT_SKU_EXISTS', `sku ${sku} already exists`, 409);
    }

    const product = await this.prisma.product.create({
      data: { sku, name, unit: input.unit, description: input.description },
    });
    return toSummary(product);
  }

  async updateProduct(id: number, input: UpdateProductInput): Promise<ProductSummary> {
    const existing = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new AppError('PRODUCT_NOT_FOUND', `product ${id} not found`, 404);
    }

    const sku = input.sku?.trim();
    if (sku && sku !== existing.sku) {
      const duplicate = await this.prisma.product.findFirst({ where: { sku, deletedAt: null, id: { not: id } } });
      if (duplicate) {
        throw new AppError('PRODUCT_SKU_EXISTS', `sku ${sku} already exists`, 409);
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        sku,
        name: input.name?.trim(),
        unit: input.unit,
        description: input.description,
        isActive: input.isActive,
      },
    });
    return toSummary(product);
  }

  /**
   * 軟刪除：商品可能已經掛在 StoreInventory/InventoryLog/RestockRequest 上（歷史庫存紀錄、
   * 補貨請求都連著這個商品），刪掉資料列會讓那些紀錄斷掉關聯，所以只設 deletedAt——
   * 之後 listProducts()/GET /inventory/products 都會自動篩掉，不需要額外改查詢邏輯。
   */
  async deleteProduct(id: number): Promise<void> {
    const existing = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new AppError('PRODUCT_NOT_FOUND', `product ${id} not found`, 404);
    }
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}

function toSummary(product: Product): ProductSummary {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    description: product.description,
    isActive: product.isActive,
    updatedAt: product.updatedAt.toISOString(),
  };
}
