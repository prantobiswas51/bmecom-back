import { DataSource } from 'typeorm';
import { LEGACY_STATUS } from './entities/order.entity.js';

/**
 * Order statuses were renamed (pending -> new, confirmed -> processing, shipped -> shipping).
 * The database column is a Postgres enum, so it has to be renamed in place before TypeORM syncs
 * the new enum, otherwise existing rows would block the change. Does nothing on a fresh database
 * or once the rename has happened, so it is safe to run on every start.
 */
export async function renameLegacyOrderStatuses(env: NodeJS.ProcessEnv = process.env) {
  const db = new DataSource({
    type: 'postgres',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USER ?? 'postgres',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME ?? 'bmecom',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await db.initialize();
  try {
    const values = await db.query<{ enumlabel: string }[]>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'orders_status_enum'`,
    );
    const have = new Set(values.map((v) => v.enumlabel));
    for (const [from, to] of Object.entries(LEGACY_STATUS)) {
      if (have.has(from) && !have.has(to)) await db.query(`ALTER TYPE orders_status_enum RENAME VALUE '${from}' TO '${to}'`);
    }
  } finally {
    await db.destroy();
  }
}
