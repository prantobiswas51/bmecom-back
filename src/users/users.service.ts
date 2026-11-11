import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findById(id: string) {
    return this.repo.findOneBy({ id });
  }

  findByEmail(email: string) {
    return this.repo.findOneBy({ email });
  }

  /** Same as findByEmail but also loads the password hash, for login. */
  findByEmailWithPassword(email: string) {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  create(data: { email: string; passwordHash: string; name?: string | null }) {
    return this.repo.save(
      this.repo.create({
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name ?? null,
      }),
    );
  }

  setPasswordHash(id: string, passwordHash: string) {
    return this.repo.update({ id }, { passwordHash });
  }

  updateProfile(id: string, data: { name: string | null }) {
    return this.repo.update({ id }, data);
  }

  markEmailVerified(id: string) {
    return this.repo.update({ id }, { emailVerifiedAt: new Date() });
  }
}
