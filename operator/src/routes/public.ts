import type { FastifyInstance } from "fastify";
import { q, one } from "../db/index.ts";
import { ledgerStatus } from "../services/chain.ts";
import { getIndexedBlock } from "../services/indexer.ts";
import { readDocument } from "../services/invoices.ts";
import { canonicalize, sha256Hex } from "@tandur/shared";

export async function publicRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "tandur-operator", time: new Date().toISOString() }));

  app.get("/ledger/status", async () => ({ ...(await ledgerStatus()), indexedBlock: await getIndexedBlock() }));

  /** Anyone holding an invoice hash can check that the ledger recorded it, with no PII returned. */
  app.get<{ Params: { hash: string } }>("/verify/:hash", async (req, reply) => {
    const hash = req.params.hash.toLowerCase();
    const events = await q(`SELECT block_number, block_time, tx_hash, args FROM chain_events WHERE name='Spent' AND lower(args->>'invoiceHash')=$1 ORDER BY block_number`, [hash]);
    const doc = readDocument(hash);
    const recomputed = doc ? await sha256Hex(canonicalize(doc)) : null;
    const inv = await one(`SELECT invoice_no, total, category_totals, status, merchant_id FROM invoices WHERE lower(hash)=$1`, [hash]);
    return reply.send({
      hash, onChain: events.length > 0, events,
      documentFound: !!doc, documentIntact: doc ? recomputed === hash : null,
      invoice: inv ? { invoiceNo: inv.invoice_no, total: inv.total, categoryTotals: inv.category_totals, status: inv.status, merchantId: inv.merchant_id } : null,
    });
  });
}
