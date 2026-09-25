import fs from "node:fs";
import path from "node:path";
import { pool } from "./index.ts";

export async function migrate() {
  const dir = path.resolve(import.meta.dirname, "../../migrations");
  for (const f of fs.readdirSync(dir).sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await pool.query(sql);
  }
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  migrate().then(() => { console.log("migrated"); process.exit(0); });
}
