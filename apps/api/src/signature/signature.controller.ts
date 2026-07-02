import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DocumentType, SignerRole } from '@prisma/client';
import { SignatureService } from './signature.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

interface CreateSignatureDto {
  customerId: number;
  documentType: DocumentType;
  signerRole: SignerRole;
  signerUserId?: number;
  signatureImageUrl: string;
  signaturePoints?: { x: number; y: number }[];
  contentSnapshot: Record<string, unknown>;
}

@Controller('signature')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('dealer', 'manager')
export class SignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  @Post()
  create(@Body() dto: CreateSignatureDto, @Req() req: Request) {
    return this.signatureService.createSignature({
      ...dto,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: req.headers['x-device-info'] as string | undefined,
    });
  }

  @Get(':id/verify')
  verify(@Param('id', ParseIntPipe) id: number) {
    return this.signatureService.verifySignature(id);
  }
}
