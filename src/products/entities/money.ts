import type { ValueTransformer } from 'typeorm';

/** Postgres returns decimals as strings; the API deals in plain numbers. */
export const numeric: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value == null ? null : Number(value)),
};
