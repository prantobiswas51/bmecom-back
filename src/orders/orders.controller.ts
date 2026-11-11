import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '../auth/auth-user.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard.js';
import { PageDto, PlaceOrderDto, QuoteDto } from './dto/order.dto.js';
import { OrdersService, SHIPPING_FEE } from './orders.service.js';

/** Public: shoppers don't need an account to price a cart or place an order. */
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('cart/quote')
  async quote(@Body() dto: QuoteDto) {
    const priced = await this.orders.quote(dto.items);
    return { ...priced, shippingFee: SHIPPING_FEE };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders')
  @UseGuards(OptionalJwtAuthGuard)
  async place(@Body() dto: PlaceOrderDto, @Req() req: { user: AuthUser | null }) {
    // Signed-in shoppers are customers (users with the customer role); guests have no account.
    const placed = await this.orders.place(dto, req.user?.id ?? null);
    return { ...placed, shippingFee: SHIPPING_FEE };
  }

  @Get('orders/mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser, @Query() query: PageDto) {
    return this.orders.mine(user.id, query.page);
  }

  @Get('orders/mine/:orderNumber')
  @UseGuards(JwtAuthGuard)
  mineOne(@CurrentUser() user: AuthUser, @Param('orderNumber') orderNumber: string) {
    return this.orders.mineOne(user.id, orderNumber);
  }

  @Get('orders/:orderNumber')
  get(@Param('orderNumber') orderNumber: string, @Query('key') key = '') {
    return this.orders.get(orderNumber, key);
  }
}
