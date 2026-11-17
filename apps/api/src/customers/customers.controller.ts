import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import type { SignerRole } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CustomerDocumentService } from './customer-document.service';
import { CustomerDisclaimerService } from './customer-disclaimer.service';
import { CustomerTreatmentService } from './customer-treatment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';

interface CustomerSignaturePayloadDto {
  signatureImageUrl: string;
  signaturePoints?: { x: number; y: number }[];
}

interface CreateCustomerWithSignatureDto {
  name: string;
  nationalId: string;
  phone?: string;
  address?: string;
  line?: string;
  email?: string;
  note?: string;
  /** admin/system_admin/dealer 建檔時要指定；manager 帶這個欄位也會被服務層忽略，一律用自己所屬的店 */
  storeId?: number;
  isExosomeUser?: boolean;
  signature: CustomerSignaturePayloadDto;
}

interface SignDisclaimerDto {
  signatureImageUrl: string;
  signaturePoints?: { x: number; y: number }[];
}

/**
 * 注意：這個介面故意不包含 name/nationalId，這是「終身鎖定」規則的第一道防線——
 * 就算前端不小心把整包顧客資料都丟過來，TypeScript 在編譯期就會擋掉多餘欄位的賦值；
 * 真正的執行期防線在 CustomersService.updateCustomer() 裡的解構賦值。
 */
interface UpdateCustomerDto {
  phone?: string;
  address?: string;
  line?: string;
  email?: string;
  note?: string;
  isExosomeUser?: boolean;
}

interface SignDocumentDto {
  signerRole: SignerRole;
  signatureImageUrl: string;
  signaturePoints?: { x: number; y: number }[];
}

/**
 * 比照 Version 1 的帳號階層：editor 完全不參與店務（不能查顧客/庫存），所以這裡故意不放 editor，
 * system_admin/admin 不需要列出來——RolesGuard 一律視為超集放行（見 role-access.util.ts isAdminRole）。
 * staff 也開放讀取與操作（POS 結帳、簽名、使用紀錄），但建立顧客、刪除顧客等高風險操作仍限 manager。
 */
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('staff', 'dealer', 'manager', 'general_agent')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customerDocumentService: CustomerDocumentService,
    private readonly customerDisclaimerService: CustomerDisclaimerService,
    private readonly customerTreatmentService: CustomerTreatmentService,
  ) {}

  @Get()
  search(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number,
  ) {
    return this.customersService.searchCustomers(actor, search, storeId);
  }

  /** 最近 3 天內刪除、可還原的顧客。必須放在 @Get(':id') 之前，否則 'deleted' 會被當成 id 解析 */
  @Get('deleted')
  @Roles('manager')
  listDeleted(@CurrentUser() actor: AuthenticatedUser) {
    return this.customersService.listRecentlyDeleted(actor);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.customersService.getCustomerDetail(actor, id);
  }

  /**
   * 建檔與簽署的不可分割交易（見 CustomersService.createCustomerWithSignature 的說明）。
   * Version 2 故意沒有提供「只建顧客、不簽名」的端點，避免留下孤兒資料。
   *
   * 故意覆寫 class 層級的 @Roles('dealer', 'manager')：只有 system_admin/admin（透過
   * isAdminRole 超集放行）與 manager 能建立顧客，經銷商可以查詢/管理區域內的顧客資料，
   * 但不能親自建檔——這跟分店管理的權限模型刻意不同，是這次業務規則明確要求的。
   */
  /**
   * 快速建立非外泌體顧客（無需簽署免責聲明書）。
   * 必填：name + phone；nationalId 選填。
   */
  @Post('quick')
  @Roles('staff', 'manager')
  createQuick(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: { name: string; phone: string; nationalId?: string; address?: string; line?: string; email?: string; note?: string; storeId?: number },
  ) {
    return this.customersService.createQuickCustomer(actor, dto);
  }

  @Post('with-signature')
  @Roles('staff', 'manager')
  createWithSignature(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCustomerWithSignatureDto, @Req() req: Request) {
    return this.customersService.createCustomerWithSignature(actor, {
      ...dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: req.headers['x-device-info'] as string | undefined,
    });
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.customersService.updateCustomer(actor, id, dto);
  }

  /**
   * 軟刪除。開放 manager（自己分店）與 admin/system_admin（isAdminRole 超集放行）；staff/dealer 不能刪。
   * 顧客還有未用完的課程或儲值金時，service 層會再限制只有 system_admin 能刪。
   * 刪除後 3 天內可用 POST :id/restore 還原。
   */
  @Delete(':id')
  @Roles('manager')
  delete(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.customersService.deleteCustomer(actor, id);
  }

  /** 還原 3 天內被刪除的顧客，權限同刪除（manager 限自己分店） */
  @Post(':id/restore')
  @Roles('manager')
  restore(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.customersService.restoreCustomer(actor, id);
  }

  /** 上傳文件照片（沿用 Version 1 的玩法：多張照片合成一份 PDF，page 1 留兩個簽名框） */
  @Post(':id/document')
  @UseInterceptors(FilesInterceptor('photos', 10, { storage: memoryStorage() }))
  uploadDocument(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.customerDocumentService.uploadPhotos(actor, id, files.map((file) => file.buffer));
  }

  /** 顧客/服務人員雙方各自簽一次，簽名疊到對應的框框裡並寫回 PDF */
  @Post(':id/document/sign')
  signDocument(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SignDocumentDto, @Req() req: Request) {
    return this.customerDocumentService.signDocument(actor, id, {
      ...dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: req.headers['x-device-info'] as string | undefined,
    });
  }

  /** 用 inline content-disposition 回傳 PDF，前端用 window.open() 開新視窗即可直接列印 */
  @Get(':id/document')
  async getDocument(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.customerDocumentService.getDocumentBuffer(actor, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="document.pdf"',
    });
    res.send(buffer);
  }

  /**
   * 服務人員事後補簽（for 非外泌體顧客後來改為使用外泌體）：
   * 建立 PDF、記錄服務人員簽名，並自動將 isExosomeUser 標記為 true。
   */
  @Post(':id/disclaimer/sign-staff')
  signStaffDisclaimer(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SignDisclaimerDto, @Req() req: Request) {
    return this.customerDisclaimerService.signStaffDisclaimer(actor, id, {
      signatureImageUrl: dto.signatureImageUrl,
      signaturePoints: dto.signaturePoints,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: req.headers['x-device-info'] as string | undefined,
    });
  }

  /** 顧客補簽免責聲明書（需先完成服務人員簽名）。 */
  @Post(':id/disclaimer/sign')
  signDisclaimer(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SignDisclaimerDto, @Req() req: Request) {
    return this.customerDisclaimerService.signDisclaimer(actor, id, {
      ...dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: req.headers['x-device-info'] as string | undefined,
    });
  }

  /** 同樣用 inline content-disposition 回傳 PDF，前端開新視窗列印 */
  @Get(':id/disclaimer')
  async getDisclaimer(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buffer = await this.customerDisclaimerService.getDisclaimerBuffer(actor, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="disclaimer.pdf"',
    });
    res.send(buffer);
  }

  // ─── 療程紀錄（商品使用紀錄，不扣庫存）───────────────────────────────────

  @Get(':id/treatments')
  listTreatments(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.customerTreatmentService.listRecords(actor, id);
  }

  @Post(':id/treatments')
  createTreatment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { productId: number; note?: string; performedAt?: string },
  ) {
    return this.customerTreatmentService.createRecord(actor, id, dto);
  }

  @Post(':id/treatments/:recordId/photos')
  @UseInterceptors(FilesInterceptor('photos', 20, { storage: memoryStorage() }))
  uploadTreatmentPhotos(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.customerTreatmentService.uploadPhotos(actor, id, recordId, files.map((f) => f.buffer));
  }

  @Delete(':id/treatments/:recordId')
  deleteTreatment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
  ) {
    return this.customerTreatmentService.deleteRecord(actor, id, recordId);
  }

  // ─── 顧客持有課程（POS 扣堂選擇器用）─────────────────────────────────────

  /**
   * 列出顧客名下所有有效課程（totalSessions - usedSessions > 0）。
   * 前端 POS 結帳選 course_deduction 時用此端點動態拉取可扣堂項目。
   */
  @Get(':id/courses')
  listCourses(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.customersService.listCustomerCourses(actor, id);
  }

  /** 顧客錢包餘額，POS 顯示用 */
  @Get(':id/wallet')
  getWallet(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.customersService.getCustomerWallet(actor, id);
  }

  /** 直接儲值（無優惠）：增加本金，寫 WalletLog + FinancialRecord */
  @Post(':id/wallet/top-up')
  topUpWallet(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { amount: number; paymentMethod: string; note?: string },
  ) {
    return this.customersService.topUpWallet(actor, id, dto);
  }
}
