/**
 * Chain indexer: copies every contract event into chain_events so Lumbung can query the audit trail
 * with SQL. The chain remains the source of truth; this table is rebuildable from block 0.
 */
import { ethers } from "ethers";
import { q, one } from "../db/index.ts";
import { deployment, provider, voucherRead, registryRead } from "./chain.ts";

const blockTimeCache = new Map<number, Date>();
async function blockTime(n: number): Promise<Date> {
  const c = blockTimeCache.get(n);
  if (c) return c;
  const b = await provider.getBlock(n);
  const d = new Date((b?.timestamp ?? 0) * 1000);
  blockTimeCache.set(n, d);
  if (blockTimeCache.size > 5000) blockTimeCache.delete(blockTimeCache.keys().next().value!);
  return d;
}

function plain(v: unknown): unknown {
  if (typeof v === "bigint") return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  if (Array.isArray(v)) return v.map(plain);
  return v;
}

function argsOf(log: ethers.EventLog): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  log.fragment.inputs.forEach((inp, i) => { out[inp.name] = plain(log.args[i]); });
  return out;
}

export async function getIndexedBlock(): Promise<number> {
  const r = await one<{ value: string }>(`SELECT value FROM indexer_state WHERE key='last_block'`);
  return r ? Number(r.value) : deployment.deployBlock - 1;
}

export async function indexOnce(): Promise<number> {
  const from = (await getIndexedBlock()) + 1;
  const latest = await provider.getBlockNumber();
  if (latest < from) return 0;
  const to = Math.min(latest, from + 500);
  let n = 0;
  for (const [name, c] of [["voucher", voucherRead], ["registry", registryRead]] as const) {
    const logs = await c.queryFilter("*", from, to);
    for (const log of logs) {
      if (!("fragment" in log)) continue;
      const el = log as ethers.EventLog;
      await q(
        `INSERT INTO chain_events (block_number, block_time, tx_hash, log_index, contract, name, args) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [el.blockNumber, await blockTime(el.blockNumber), el.transactionHash, el.index, name, el.fragment.name, JSON.stringify(argsOf(el))],
      );
      n++;
    }
  }
  await q(`INSERT INTO indexer_state (key, value) VALUES ('last_block', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [String(to)]);
  return n;
}

export function startIndexer(log: (msg: string) => void) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      let n;
      do { n = await indexOnce(); } while (n > 0 && (await getIndexedBlock()) < (await provider.getBlockNumber()));
    } catch (e) {
      log(`indexer error: ${(e as Error).message}`);
    } finally { running = false; }
  };
  tick();
  return setInterval(tick, 2000);
}
