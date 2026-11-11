import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordService } from '../auth/password.service.js';
import { User } from './user.entity.js';
import { UsersAdminController } from './users-admin.controller.js';
import { UsersAdminService } from './users-admin.service.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersAdminController],
  providers: [UsersService, UsersAdminService, PasswordService],
  exports: [UsersService],
})
export class UsersModule {}
