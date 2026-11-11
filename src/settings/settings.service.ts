import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UpdateSettingsDto } from './dto/settings.dto.js';
import {
  DEFAULT_CURRENCY,
  DEFAULT_THEME,
  THEME_KEYS,
  type CurrencySetting,
  type ThemeColors,
} from './settings.defaults.js';
import { Setting } from './setting.entity.js';

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(Setting) private readonly repo: Repository<Setting>) {}

  /** What is saved, filled in from the defaults for anything missing. */
  async get() {
    const rows = await this.repo.find();
    const saved = (key: string) => rows.find((r) => r.key === key)?.value ?? {};
    const theme: ThemeColors = { ...DEFAULT_THEME };
    for (const k of THEME_KEYS) {
      const v = (saved('theme') as Partial<ThemeColors>)[k];
      if (typeof v === 'string') theme[k] = v.toLowerCase();
    }
    const currency: CurrencySetting = { ...DEFAULT_CURRENCY, ...(saved('currency') as Partial<CurrencySetting>) };
    return { theme, currency, defaults: { theme: DEFAULT_THEME, currency: DEFAULT_CURRENCY } };
  }

  async update(dto: UpdateSettingsDto) {
    if (dto.theme) {
      const theme = Object.fromEntries(THEME_KEYS.map((k) => [k, dto.theme![k].toLowerCase()]));
      await this.repo.save({ key: 'theme', value: theme });
    }
    if (dto.currency) {
      await this.repo.save({
        key: 'currency',
        value: { ...dto.currency, code: dto.currency.code.toUpperCase() },
      });
    }
    return this.get();
  }
}
