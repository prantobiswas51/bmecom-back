import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service.js';
import type { CreateUserDto, ListUsersDto, UpdateUserDto } from './dto/user.dto.js';
import { User, UserRole } from './user.entity.js';

const view = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  emailVerified: u.emailVerifiedAt !== null,
  createdAt: u.createdAt,
});

/** Admin-side management of accounts. Passwords are never read or written here. */
@Injectable()
export class UsersAdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: ListUsersDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const term = query.q?.trim();
    const like = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null;

    const [rows, total] = await this.users.findAndCount({
      where: like
        ? [
            { email: ILike(like), ...(query.role && { role: query.role }) },
            { name: ILike(like), ...(query.role && { role: query.role }) },
          ]
        : query.role
          ? { role: query.role }
          : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(view), total, page, limit };
  }

  async get(id: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return view(user);
  }

  async create(dto: CreateUserDto) {
    await this.assertEmailFree(dto.email);
    // A random password nobody knows: the person sets theirs with "Forgot password".
    const passwordHash = await this.passwords.hash(randomBytes(24).toString('hex'));
    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        passwordHash,
        name: dto.name ?? null,
        role: dto.role ?? UserRole.Customer,
        emailVerifiedAt: dto.emailVerified ? new Date() : null,
      }),
    );
    return view(user);
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');

    if (dto.role !== undefined && dto.role !== user.role && id === actingUserId) {
      throw new BadRequestException('You cannot change your own role');
    }
    if (dto.email !== undefined && dto.email !== user.email) {
      await this.assertEmailFree(dto.email, id);
      user.email = dto.email;
    }
    if (dto.name !== undefined) user.name = dto.name ?? null;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.emailVerified !== undefined && dto.emailVerified !== (user.emailVerifiedAt !== null)) {
      user.emailVerifiedAt = dto.emailVerified ? new Date() : null;
    }
    return view(await this.users.save(user));
  }

  async remove(id: string, actingUserId: string) {
    if (id === actingUserId) throw new BadRequestException('You cannot delete your own account');
    // Sessions and tokens go with the account; their past orders stay, just unlinked.
    const result = await this.users.delete({ id });
    if (!result.affected) throw new NotFoundException('User not found');
  }

  private async assertEmailFree(email: string, selfId?: string) {
    const taken = await this.users.existsBy({ email, ...(selfId && { id: Not(selfId) }) });
    if (taken) throw new ConflictException(`"${email}" already has an account`);
  }
}
