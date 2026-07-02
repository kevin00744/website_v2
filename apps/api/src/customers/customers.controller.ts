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
}

interface SignDocumentDto {
  signerRole: SignerRole;
  signatureImageUrl: string;
  signaturePoints?: { x: number; y: number }[];
}

/**
 * 比照 Version 1 的帳號階層：editor 完全不參與店務（不能查顧客/庫存），所以這裡故意不放 editor，
 * system_admin/admin 不需要列出來——RolesGuard 一律視為超集放行（見 role-access.util.ts isAdminRole）。
 */
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dealer', 'manager')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customerDocumentService: CustomerDocumentService,
    private readonly customerDisclaimerService: CustomerDisclaimerService,
  ) {}

  @Get()
  search(@CurrentUser() actor: AuthenticatedUser, @Query('search') search?: string) {
    return this.customersService.searchCustomers(actor, search);
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
  @Post('with-signature')
  @Roles('manager')
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
   * 軟刪除，故意覆寫 class 層級的 @Roles('dealer','manager')：刪顧客是比建檔/編輯更高風險的操作
   * （牽連簽名/文件等法律效力紀錄），只開放給 admin/system_admin（透過 isAdminRole 超集放行），
   * dealer/manager 不能刪，跟 Patch(':id') 的編輯權限刻意分開。
   */
  @Delete(':id')
  @Roles('admin')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.deleteCustomer(id);
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
   * 服務人員補簽免責聲明書（顧客那次簽名在建檔當下已經完成，見 with-signature）。
   * 故意不接受 signerRole 參數——這支端點存在的唯一目的就是服務人員counter-sign。
   */
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
}
