import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/auth-user.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../users/user.entity.js';
import { AdjustStockDto, ListStockDto, StockHistoryDto } from './dto/stock.dto.js';
import { StockService } from './stock.service.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.Superadmin)
@Controller('admin/stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  list(@Query() query: ListStockDto) {
    return this.stock.list(query);
  }

  @Get('history')
  history(@Query() query: StockHistoryDto) {
    return this.stock.history(query.productId, query.variantId);
  }

  @Post('adjust')
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() me: AuthUser) {
    return this.stock.adjust(dto, me.email);
  }
}
