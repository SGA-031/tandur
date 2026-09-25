import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(import.meta.dirname, "../../.env"), override: true });

function req(k: string, d?: string): string {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`Missing env ${k}`);
  return v;
}
export const env = {
  RPC_URL: req("RPC_URL", "http://127.0.0.1:8545"),
  CHAIN_ID: Number(req("CHAIN_ID", "6221")),
  OPERATOR_KEY: req("OPERATOR_KEY"),
  DATABASE_URL: req("DATABASE_URL"),
  JWT_SECRET: req("JWT_SECRET"),
  VAULT_SECRET: req("VAULT_SECRET"),
  PORT: Number(req("OPERATOR_PORT", "4600")),
  STORAGE_DIR: path.resolve(import.meta.dirname, "..", req("STORAGE_DIR", "./storage")),
};
