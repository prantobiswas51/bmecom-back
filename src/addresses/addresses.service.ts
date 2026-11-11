import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './address.entity.js';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

const MAX_ADDRESSES = 10;

@Injectable()
export class AddressesService {
  constructor(@InjectRepository(Address) private readonly repo: Repository<Address>) {}

  /** The default first, then newest. */
  list(userId: string) {
    return this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'DESC' } });
  }

  private async owned(userId: string, id: string) {
    const found = await this.repo.findOneBy({ id, userId });
    if (!found) throw new NotFoundException('Address not found');
    return found;
  }

  async create(userId: string, dto: CreateAddressDto) {
    if ((await this.repo.countBy({ userId })) >= MAX_ADDRESSES) {
      throw new BadRequestException(`You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.`);
    }
    return this.repo.manager.transaction(async (tx) => {
      const repo = tx.getRepository(Address);
      // The first address is always the default.
      const makeDefault = dto.isDefault === true || !(await repo.existsBy({ userId }));
      if (makeDefault) await repo.update({ userId }, { isDefault: false });
      return repo.save(
        repo.create({
          userId,
          label: dto.label || null,
          fullName: dto.fullName,
          phone: dto.phone,
          address: dto.address,
          isDefault: makeDefault,
        }),
      );
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const existing = await this.owned(userId, id);
    return this.repo.manager.transaction(async (tx) => {
      const repo = tx.getRepository(Address);
      // Asking for "not default" on the default is ignored: another address has to be chosen instead.
      if (dto.isDefault && !existing.isDefault) await repo.update({ userId }, { isDefault: false });
      const { isDefault, ...fields } = dto;
      // Fields the client left out arrive as undefined; keep what is stored for those.
      const sent = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      return repo.save({ ...existing, ...sent, isDefault: existing.isDefault || isDefault === true });
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.owned(userId, id);
    await this.repo.manager.transaction(async (tx) => {
      const repo = tx.getRepository(Address);
      await repo.delete({ id });
      if (existing.isDefault) {
        const next = await repo.findOne({ where: { userId }, order: { createdAt: 'DESC' } });
        if (next) await repo.update({ id: next.id }, { isDefault: true });
      }
    });
  }
}
