import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EditOrderDto, ListOrdersAdminDto, SetOrderStatusDto } from './dto/order.dto.js';
import { OrdersAdminService } from './orders-admin.service.js';

// TODO: any signed-in role can manage orders for now; restrict with RolesGuard before launch.
@UseGuards(JwtAuthGuard)
@Controller('admin/orders')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersAdminService) {}

  @Get()
  list(@Query() query: ListOrdersAdminDto) {
    return this.orders.list(query);
  }

  @Get('products')
  searchProducts(@Query('q') q = '') {
    return this.orders.searchProducts(q);
  }

  @Get(':orderNumber')
  get(@Param('orderNumber') orderNumber: string) {
    return this.orders.get(orderNumber);
  }

  @Patch(':orderNumber')
  edit(@Param('orderNumber') orderNumber: string, @Body() dto: EditOrderDto) {
    return this.orders.edit(orderNumber, dto);
  }

  @Patch(':orderNumber/status')
  setStatus(@Param('orderNumber') orderNumber: string, @Body() dto: SetOrderStatusDto) {
    return this.orders.setStatus(orderNumber, dto.status);
  }
}
