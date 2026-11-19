import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findById(id: string) {
    return this.repo.findOneBy({ id });
  }

  /** The account that owns this address: the one that verified it. */
  findVerifiedByEmail(email: string) {
    return this.repo.findOneBy({ email, emailVerifiedAt: Not(IsNull()) });
  }

  /** Every account signed up with this address, the verified one first, then newest. */
  findAllByEmail(email: string) {
    return this.repo.find({ where: { email }, order: { emailVerifiedAt: { direction: 'ASC', nulls: 'LAST' }, createdAt: 'DESC' } });
  }

  /** Same people as findAllByEmail, with the password hashes, for login. */
  findAllByEmailWithPassword(email: string) {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .orderBy('user.emailVerifiedAt', 'ASC', 'NULLS LAST')
      .addOrderBy('user.createdAt', 'DESC')
      .getMany();
  }

  findByIdWithPassword(id: string) {
    return this.repo.createQueryBuilder('user').addSelect('user.passwordHash').where('user.id = :id', { id }).getOne();
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
