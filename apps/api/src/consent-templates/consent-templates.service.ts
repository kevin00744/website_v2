import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { isAdminRole } from '../auth/role-access.util';
import type { AuthenticatedUser } from '../auth/types';
import { buildDisclaimerPdf, type DisclaimerSection } from '../customers/disclaimer-pdf.util';

export interface ConsentTemplateInput {
  title?: string;
  sections?: DisclaimerSection[];
}

/** 預覽用的範例顧客資料（PDF 頁首） */
const SAMPLE_HEADER = {
  customerName: '王小明',
  customerCode: 'DEFAULT-A123456789',
  nationalId: 'A123456789',
  phone: '0912-345-678',
  address: '台北市範例路 1 號',
  storeName: '璨妍門市',
  storeCode: 'DEFAULT',
};

/**
 * 同意書範本管理（disclaimer_templates）。
 * 每次儲存都產生新版本並設為使用中；已簽署的顧客保留簽署當時凍結的內容（contentSnapshot），不受影響。
 */
@Injectable()
export class ConsentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(actor: AuthenticatedUser) {
    if (!isAdminRole(actor.role)) throw new AppError('PERMISSION_DENIED', '只有管理員可以管理同意書', 403);
  }

  async list(actor: AuthenticatedUser) {
    this.assertAdmin(actor);
    const rows = await this.prisma.disclaimerTemplate.findMany({ orderBy: { createdAt: 'desc' } });
    const signedCounts = await this.prisma.$queryRaw<Array<{ version: string; count: bigint }>>`
      SELECT content_snapshot->>'templateVersion' AS version, COUNT(*)::bigint AS count
      FROM signatures
      WHERE document_type = 'disclaimer' AND signer_role = 'customer'
      GROUP BY 1`;
    const countOf = (v: string) => Number(signedCounts.find((c) => c.version === v)?.count ?? 0);
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      title: r.title,
      sectionCount: Array.isArray(r.sections) ? r.sections.length : 0,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      signedCount: countOf(r.version),
    }));
  }

  async get(actor: AuthenticatedUser, id: number) {
    this.assertAdmin(actor);
    const row = await this.prisma.disclaimerTemplate.findUnique({ where: { id } });
    if (!row) throw new AppError('CONSENT_TEMPLATE_NOT_FOUND', undefined, 404);
    return { id: row.id, version: row.version, title: row.title, sections: row.sections, isActive: row.isActive, createdAt: row.createdAt.toISOString() };
  }

  /** 存成新版本並設為使用中（其他版本停用） */
  async create(actor: AuthenticatedUser, input: ConsentTemplateInput) {
    this.assertAdmin(actor);
    const { title, sections } = normalize(input);

    return this.prisma.$transaction(async (tx) => {
      const versions = await tx.disclaimerTemplate.findMany({ select: { version: true } });
      const max = versions.reduce((m, v) => Math.max(m, Number(/^v(\d+)$/.exec(v.version)?.[1] ?? 0)), 0);
      const version = `v${max + 1}`;
      await tx.disclaimerTemplate.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const row = await tx.disclaimerTemplate.create({
        data: { version, title, sections: sections as unknown as Prisma.InputJsonValue, isActive: true },
      });
      return { id: row.id, version: row.version, title: row.title, sections: row.sections, isActive: true, createdAt: row.createdAt.toISOString() };
    });
  }

  /** 切回某個版本（設為使用中） */
  async activate(actor: AuthenticatedUser, id: number) {
    this.assertAdmin(actor);
    const row = await this.prisma.disclaimerTemplate.findUnique({ where: { id } });
    if (!row) throw new AppError('CONSENT_TEMPLATE_NOT_FOUND', undefined, 404);
    await this.prisma.$transaction([
      this.prisma.disclaimerTemplate.updateMany({ where: { isActive: true, id: { not: id } }, data: { isActive: false } }),
      this.prisma.disclaimerTemplate.update({ where: { id }, data: { isActive: true } }),
    ]);
    return { id, version: row.version, isActive: true };
  }

  /** 用範例顧客資料產生 PDF 預覽（不寫入資料庫） */
  async previewDraft(actor: AuthenticatedUser, input: ConsentTemplateInput): Promise<Buffer> {
    this.assertAdmin(actor);
    const { title, sections } = normalize(input);
    const { pdfBytes } = await buildDisclaimerPdf({ title, sections }, SAMPLE_HEADER);
    return Buffer.from(pdfBytes);
  }

  async previewSaved(actor: AuthenticatedUser, id: number): Promise<Buffer> {
    this.assertAdmin(actor);
    const row = await this.prisma.disclaimerTemplate.findUnique({ where: { id } });
    if (!row) throw new AppError('CONSENT_TEMPLATE_NOT_FOUND', undefined, 404);
    const { pdfBytes } = await buildDisclaimerPdf(
      { title: row.title, sections: row.sections as unknown as DisclaimerSection[] },
      SAMPLE_HEADER,
    );
    return Buffer.from(pdfBytes);
  }
}

/** 檢查並整理輸入：去掉前後空白、空段落；標題、段落標題必填 */
function normalize(input: ConsentTemplateInput): { title: string; sections: DisclaimerSection[] } {
  const title = input.title?.trim();
  if (!title) throw new AppError('CONSENT_TEMPLATE_TITLE_REQUIRED', undefined, 400);
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    throw new AppError('CONSENT_TEMPLATE_SECTIONS_REQUIRED', undefined, 400);
  }
  if (input.sections.length > 50) throw new AppError('CONSENT_TEMPLATE_INVALID', '段落太多（最多 50 段）', 400);
  const sections = input.sections.map((s) => {
    const heading = typeof s?.heading === 'string' ? s.heading.trim() : '';
    if (!heading) throw new AppError('CONSENT_TEMPLATE_HEADING_REQUIRED', undefined, 400);
    const paragraphs = Array.isArray(s.paragraphs)
      ? s.paragraphs.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean)
      : [];
    return { heading, paragraphs, requiresSignature: Boolean(s.requiresSignature) };
  });
  return { title, sections };
}
