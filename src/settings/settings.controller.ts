import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UpdateSettingsDto } from './dto/settings.dto.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public: the storefront needs the colours and currency to render at all. */
  @Get()
  get() {
    return this.settings.get();
  }

  // TODO: any signed-in role can change settings for now; restrict with RolesGuard before launch.
  @UseGuards(JwtAuthGuard)
  @Put()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
