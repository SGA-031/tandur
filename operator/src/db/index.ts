import pg from "pg";
import { env } from "../env.ts";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
pg.types.setTypeParser(20, (v) => Number(v)); // int8 -> number (amounts fit safely in 2^53)
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric -> number

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}
export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}
