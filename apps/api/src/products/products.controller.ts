import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

interface CreateProductDto {
  sku: string;
  name: string;
  unit?: string;
  description?: string;
}

interface UpdateProductDto {
  sku?: string;
  name?: string;
  unit?: string;
  description?: string;
  isActive?: boolean;
}

/** 商品建檔頁面：只開放給 admin/system_admin（@Roles('system_admin') 加上 RolesGuard 的 isAdminRole 超集放行，admin 本來就會通過） */
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('system_admin')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list() {
    return this.productsService.listProducts();
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productsService.updateProduct(id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.deleteProduct(id);
  }
}
