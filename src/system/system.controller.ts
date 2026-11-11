import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { UserRole } from '../users/user.entity.js';
import { SystemService } from './system.service.js';

// Unlike the other admin routes this one is already limited to admins: it shows server logs,
// which can hold personal data, and anyone can sign up as a customer.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin, UserRole.Superadmin)
@Controller('admin/system-health')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  health() {
    return this.system.health();
  }
}
