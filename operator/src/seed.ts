/**
 * Demo seed: registers farmers + merchants on-chain, creates the season's voucher types, issues allocations,
 * then replays ~3 weeks of purchases as REAL ledger transactions (each with the farmer's EIP-712 signature).
 * Invoice timestamps are backdated in the operator DB so Lumbung has a time series; block timestamps stay real.
 * Requires a freshly deployed contract pair (registry must be empty).
 */
import { ethers } from "ethers";
import { pool, q, one } from "./db/index.ts";
import { migrate } from "./db/migrate.ts";
import { b32, confirm, registry, registryRead, voucher, voucherRead, operatorAddress, TX } from "./services/chain.ts";
import { createCustodiedAccount, hashSecret, nikHashFor, pseudoIdFor, maskNik } from "./services/vault.ts";
import { createInvoice } from "./services/invoices.ts";
import { payInvoice, coverageFor } from "./services/payment.ts";
import { runFraudRules } from "./services/fraud.ts";
import { indexOnce } from "./services/indexer.ts";
import { runPayouts } from "./services/payouts.ts";

const PIN = "123456";
const MERCHANT_PW = "tandur123";

// ---------------------------------------------------------------- reference data
const REGIONS = [
  { province: "Jawa Tengah", regency: "Klaten", code: "33.10", districts: ["Delanggu", "Juwiring", "Wonosari"], villages: ["Sabrang", "Bulan", "Tlobong", "Kwarasan", "Bolopleret", "Jelobo"], names: "jv" },
  { province: "Jawa Tengah", regency: "Sragen", code: "33.14", districts: ["Sidoharjo", "Masaran", "Tanon"], villages: ["Purwosuman", "Jetak", "Krebet", "Sepat", "Gabugan", "Karangtalun"], names: "jv" },
  { province: "Jawa Timur", regency: "Ngawi", code: "35.21", districts: ["Paron", "Kedunggalar", "Geneng"], villages: ["Gelung", "Jambangan", "Wonokerto", "Klitik", "Tepas", "Dempel"], names: "jv" },
  { province: "Jawa Timur", regency: "Jember", code: "35.09", districts: ["Rambipuji", "Jenggawah", "Ambulu"], villages: ["Rowotamtu", "Pecoro", "Cangkring", "Sabrang", "Sumberejo", "Andongsari"], names: "jv" },
  { province: "Sumatera Selatan", regency: "Ogan Komering Ulu", code: "16.01", districts: ["Baturaja Timur", "Peninjauan", "Lubuk Batang"], villages: ["Sekar Jaya", "Tanjung Baru", "Kedaton", "Lubuk Banjar", "Karang Endah", "Bandar Jaya"], names: "sum" },
  { province: "Sumatera Selatan", regency: "Banyuasin", code: "16.07", districts: ["Banyuasin III", "Rambutan", "Talang Kelapa"], villages: ["Pangkalan Balai", "Sako", "Tanjung Lago", "Mulya Sari", "Sungai Pinang", "Lebung"], names: "sum" },
];
const JV_NAMES = ["Sutrisno", "Sri Wahyuni", "Paidi", "Suparman", "Wagimin", "Sumarni", "Ngatiyem", "Slamet Riyadi", "Tukiman", "Sarinah", "Mulyono", "Karsih", "Bambang Sutejo", "Ponirah", "Suyatno", "Warsini", "Joko Santoso", "Lasmi", "Hartono", "Rukmini", "Sugeng Prayitno", "Sunarti", "Kasno", "Tumirah"];
const SUM_NAMES = ["Muhammad Yusuf", "Siti Aminah", "Zulkifli", "Ratna Sari", "Abdul Rozak", "Nurhayati", "Herman Syahputra", "Maryam", "Ahmad Fauzi", "Erna Wati", "Rusdi Effendi", "Halimah", "Bakri", "Yulianti", "Syamsul Bahri", "Rohana", "Iskandar", "Mardiana", "Taufik Hidayat", "Sumiati", "Kemas Abdullah", "Leni Marlina", "Darmawan", "Nurbaiti"];

const MERCHANTS = [
  { id: "KDMP-3310-001", name: "Koperasi Desa Merah Putih Sabrang", kind: "kdmp", region: 0, city: "Klaten", username: "kdmp-klaten", bank: "BRI 0021-01-045678-50-1", lat: -7.62, lng: 110.68 },
  { id: "KIOS-3310-004", name: "Kios Tani Subur Makmur", kind: "kios", region: 0, city: "Delanggu", username: "kios-delanggu", bank: "BRI 0021-01-078901-50-3", lat: -7.61, lng: 110.69 },
  { id: "KDMP-3314-001", name: "Koperasi Desa Merah Putih Purwosuman", kind: "kdmp", region: 1, city: "Sragen", username: "kdmp-sragen", bank: "Bank Jateng 2-034-01234-5", lat: -7.42, lng: 111.02 },
  { id: "KIOS-3314-002", name: "Kios Tani Makmur Jaya", kind: "kios", region: 1, city: "Masaran", username: "kios-sragen", bank: "BRI 0345-01-011223-50-7", lat: -7.45, lng: 110.95 },
  { id: "KDMP-3521-001", name: "Koperasi Desa Merah Putih Gelung", kind: "kdmp", region: 2, city: "Ngawi", username: "kdmp-ngawi", bank: "Bank Jatim 0031-2345-678", lat: -7.40, lng: 111.35 },
  { id: "KDMP-3509-001", name: "Koperasi Desa Merah Putih Rowotamtu", kind: "kdmp", region: 3, city: "Jember", username: "kdmp-jember", bank: "Bank Jatim 0041-8765-432", lat: -8.20, lng: 113.62 },
  { id: "KDMP-1601-001", name: "Koperasi Desa Merah Putih Sekar Jaya", kind: "kdmp", region: 4, city: "Baturaja", username: "kdmp-baturaja", bank: "Bank Sumsel Babel 140-01-00123", lat: -4.13, lng: 104.17 },
  { id: "KIOS-1607-003", name: "Kios Saprodi Pangkalan Balai", kind: "kios", region: 5, city: "Pangkalan Balai", username: "kios-banyuasin", bank: "BRI 0090-01-099887-50-2", lat: -2.90, lng: 104.62 },
];

const PRODUCTS = [
  ["PPK-UREA-50", "Urea Bersubsidi", "Pupuk Indonesia", "PUPUK", "karung 50 kg", 112500],
  ["PPK-NPK-50", "NPK Phonska Bersubsidi 15-10-12", "Petrokimia Gresik", "PUPUK", "karung 50 kg", 115000],
  ["PPK-NPKK-50", "NPK Kakao Bersubsidi", "Petrokimia Gresik", "PUPUK", "karung 50 kg", 165000],
  ["PPK-ZA-50", "ZA Bersubsidi", "Petrokimia Gresik", "PUPUK", "karung 50 kg", 85000],
  ["PPK-ORG-40", "Petroganik Organik Bersubsidi", "Petrokimia Gresik", "PUPUK", "karung 40 kg", 32000],
  ["PPK-SP36-50", "SP-36 Bersubsidi", "Petrokimia Gresik", "PUPUK", "karung 50 kg", 120000],
  ["BNH-INP32-5", "Benih Padi Inpari 32 HDB", "Sang Hyang Seri", "BENIH", "kantong 5 kg", 65000],
  ["BNH-CHR-5", "Benih Padi Ciherang", "Sang Hyang Seri", "BENIH", "kantong 5 kg", 60000],
  ["BNH-INP42-5", "Benih Padi Inpari 42 Agritan", "Pertani", "BENIH", "kantong 5 kg", 68000],
  ["BNH-JGB18-1", "Benih Jagung Hibrida BISI-18", "BISI", "BENIH", "kantong 1 kg", 95000],
  ["BNH-KDL-5", "Benih Kedelai Anjasmoro", "Balitkabi", "BENIH", "kantong 5 kg", 75000],
  ["ALS-CKL", "Cangkul Baja", "Crocodile", "ALSINTAN", "unit", 85000],
  ["ALS-SBT", "Sabit Panen", "Crocodile", "ALSINTAN", "unit", 45000],
  ["ALS-SPR16", "Sprayer Manual 16 L", "Swan", "ALSINTAN", "unit", 350000],
  ["ALS-SPRE16", "Sprayer Elektrik 16 L", "Tasco", "ALSINTAN", "unit", 650000],
  ["ALS-TRP68", "Terpal Jemur 6x8 m", "Orchid", "ALSINTAN", "lembar", 250000],
  ["ALS-PMP3", "Pompa Air 3 inci", "Honda", "ALSINTAN", "unit", 2450000],
  ["ALS-HND", "Hand Sprayer 2 L", "Kenmaster", "ALSINTAN", "unit", 55000],
  ["PST-REG100", "Insektisida Regent 50 SC", "BASF", "PESTISIDA", "botol 100 ml", 55000],
  ["PST-VRT50", "Insektisida Virtako 40 WG", "Syngenta", "PESTISIDA", "sachet 50 g", 85000],
  ["PST-GRX1", "Herbisida Gramoxone 276 SL", "Syngenta", "PESTISIDA", "botol 1 L", 95000],
  ["PST-SCR250", "Fungisida Score 250 EC", "Syngenta", "PESTISIDA", "botol 250 ml", 120000],
  ["PST-RDM100", "Rodentisida Klerat RM-B", "Syngenta", "PESTISIDA", "sachet 100 g", 25000],
] as const;

// Deterministic PRNG so re-seeding gives the same story.
let seedState = 20260925;
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) % 4294967296; return seedState / 4294967296; };
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

function sendBatches<T>(items: T[], size: number, fn: (x: T) => Promise<unknown>) {
  return (async () => {
    for (let i = 0; i < items.length; i += size) {
      await Promise.all(items.slice(i, i + size).map(fn));
      process.stdout.write(`\r  ${Math.min(i + size, items.length)}/${items.length}`);
    }
    process.stdout.write("\n");
  })();
}

async function main() {
  await migrate();
  const farmerCount = Number(await registryRead.farmerCount());
  if (farmerCount > 0) throw new Error(`Registry already has ${farmerCount} farmers. Reset the chain and redeploy first: npm run chain:down && npm run chain:up && npm run contracts:deploy`);
  console.log(`Seeding as operator ${operatorAddress}`);
  await pool.query(`TRUNCATE farmers, merchants, admins, products, voucher_types, allocations, invoices, chain_events, indexer_state, payouts, fraud_alerts, notifications, audit_log RESTART IDENTITY CASCADE`);

  // admins
  for (const [u, p, n, r] of [["admin", "lumbung123", "Dit. Pupuk & Pestisida, Kementan", "ministry"], ["operator", "lumbung123", "PT Tandur Nusantara (Operator)", "operator"], ["auditor", "lumbung123", "BPKP Auditor", "auditor"]]) {
    await q(`INSERT INTO admins (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4)`, [u, hashSecret(p), n, r]);
  }
  // products
  for (const p of PRODUCTS) await q(`INSERT INTO products (sku, name, brand, category, unit, het_price) VALUES ($1,$2,$3,$4,$5,$6)`, p as unknown as unknown[]);

  // merchants
  console.log("Registering merchants on-chain");
  const merchantRows: any[] = [];
  for (const m of MERCHANTS) {
    const r = REGIONS[m.region];
    const acct = createCustodiedAccount(MERCHANT_PW);
    await q(`INSERT INTO merchants (id, name, kind, city, district, regency, province, region_code, lat, lng, address, enc_key, username, password_hash, bank_account) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [m.id, m.name, m.kind, m.city, r.districts[0], r.regency, r.province, r.code + ".01", m.lat, m.lng, acct.address, acct.encKey, m.username, hashSecret(MERCHANT_PW), m.bank]);
    merchantRows.push({ ...m, address: acct.address, regency: r.regency });
  }
  await sendBatches(merchantRows, 8, (m) => confirm(registry.registerMerchant(m.address, b32(m.id), b32(REGIONS[m.region].code + ".01"), m.kind === "kdmp" ? 1 : 2, TX)));

  // farmers: 12 per regency
  console.log("Registering farmers on-chain");
  const farmerRows: any[] = [];
  let n = 0;
  for (const [ri, r] of REGIONS.entries()) {
    const names = r.names === "jv" ? JV_NAMES : SUM_NAMES;
    for (let i = 0; i < 12; i++) {
      n++;
      const id = `F-${String(n).padStart(6, "0")}`;
      const nik = `${r.code.replace(".", "")}${String(between(1, 30)).padStart(2, "0")}${String(between(1, 28)).padStart(2, "0")}${String(between(1, 12)).padStart(2, "0")}${String(between(55, 99))}${String(n).padStart(4, "0")}`;
      const name = n === 1 ? "Sutrisno" : names[(i + ri * 5) % names.length];
      const acct = createCustodiedAccount(PIN);
      const landHa = n === 1 ? 1.5 : [0.25, 0.5, 0.5, 0.75, 1, 1, 1.5, 2][between(0, 7)];
      const commodity = r.names === "sum" && rnd() < 0.3 ? "jagung" : rnd() < 0.15 ? "kedelai" : "padi";
      const district = r.districts[i % 3];
      const regionCode = `${r.code}.${String((i % 3) + 1).padStart(2, "0")}`;
      await q(`INSERT INTO farmers (id, pseudo_id, nik_hash, nik_masked, name, phone, village, district, regency, province, region_code, land_ha, commodity, address, enc_key, pin_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, pseudoIdFor(nik), nikHashFor(nik), maskNik(nik), name, `08${between(11, 99)}${String(between(1000000, 9999999))}`, r.villages[i % 6], district, r.regency, r.province, regionCode, landHa, commodity, acct.address, acct.encKey, hashSecret(PIN)]);
      farmerRows.push({ id, nik, name, address: acct.address, regionCode, regency: r.regency, province: r.province, landHa, ri });
    }
  }
  await sendBatches(farmerRows, 24, (f) => confirm(registry.registerFarmer(f.address, pseudoIdFor(f.nik), b32(f.regionCode), TX)));
  console.log(`Demo farmer: ${farmerRows[0].name}  NIK ${farmerRows[0].nik}  PIN ${PIN}`);

  // voucher types for musim tanam 1 2026/27
  console.log("Creating voucher types");
  const season = "MT1-2026/27";
  const validFrom = Math.floor(new Date("2026-09-01T00:00:00+07:00").getTime() / 1000);
  const validUntil = Math.floor(new Date("2027-03-31T23:59:59+07:00").getTime() / 1000);
  const TYPES: [string, number][] = [["PUPUK", 1_500_000], ["BENIH", 500_000], ["ALSINTAN", 1_000_000], ["PESTISIDA", 400_000]];
  const typeIds: Record<string, number> = {};
  for (const [cat, cap] of TYPES) {
    const rc = await confirm(voucher.createVoucherType(b32(cat), b32(season), validFrom, validUntil, cap, TX));
    const typeId = Number(await voucherRead.typeCount());
    typeIds[cat] = typeId;
    await q(`INSERT INTO voucher_types (type_id, category, season, valid_from, valid_until, per_farmer_cap, tx_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [typeId, cat, season, new Date(validFrom * 1000), new Date(validUntil * 1000), cap, rc.hash]);
  }

  // allocations (per hectare for inputs, flat for tools)
  console.log("Issuing allocations");
  const ALLOC: Record<string, (ha: number) => number> = { PUPUK: (ha) => Math.min(1_500_000, Math.round(600_000 * ha)), BENIH: (ha) => Math.min(500_000, Math.round(200_000 * ha)), ALSINTAN: () => 750_000, PESTISIDA: (ha) => Math.min(400_000, Math.round(150_000 * ha)) };
  let allocSeq = 0;
  for (const [cat] of TYPES) {
    allocSeq++;
    const id = `ALLOC-MT1202627-${String(allocSeq).padStart(3, "0")}`;
    const targets = farmerRows.map((f) => ({ address: f.address, amount: ALLOC[cat](f.landHa) })).filter((t) => t.amount > 0);
    const txHashes: string[] = [];
    for (let i = 0; i < targets.length; i += 40) {
      const chunk = targets.slice(i, i + 40);
      txHashes.push((await confirm(voucher.issueBatch(chunk.map((t) => t.address), typeIds[cat], chunk.map((t) => t.amount), b32(id), TX))).hash);
    }
    await q(`INSERT INTO allocations (id, title, type_id, farmer_count, total_amount, tx_hashes, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, `Alokasi ${cat} ${season} (Perpres 6/2025)`, typeIds[cat], targets.length, targets.reduce((a, t) => a + t.amount, 0), txHashes, "admin", new Date(Date.now() - 24 * 86400e3)]);
  }

  // purchases over the last 21 days
  console.log("Replaying purchases on-chain");
  const farmersDb = new Map((await q(`SELECT * FROM farmers`)).map((f) => [f.id, f]));
  const merchantsByRegency = new Map<string, any[]>();
  for (const m of merchantRows) merchantsByRegency.set(m.regency, [...(merchantsByRegency.get(m.regency) ?? []), m]);
  const baskets: { skus: [string, number][]; w: number }[] = [
    { skus: [["PPK-UREA-50", 2], ["PPK-NPK-50", 2]], w: 5 }, { skus: [["PPK-UREA-50", 3], ["PPK-NPK-50", 2], ["PPK-ORG-40", 2]], w: 4 },
    { skus: [["PPK-NPK-50", 1], ["PPK-ZA-50", 1]], w: 3 }, { skus: [["BNH-INP32-5", 2]], w: 3 }, { skus: [["BNH-CHR-5", 3], ["PPK-UREA-50", 1]], w: 2 },
    { skus: [["BNH-JGB18-1", 3]], w: 2 }, { skus: [["ALS-SPR16", 1]], w: 2 }, { skus: [["ALS-CKL", 1], ["ALS-SBT", 2]], w: 2 }, { skus: [["ALS-TRP68", 1]], w: 1 },
    { skus: [["PST-REG100", 2], ["PST-VRT50", 1]], w: 3 }, { skus: [["PST-GRX1", 1]], w: 2 }, { skus: [["PST-SCR250", 1], ["PST-RDM100", 2]], w: 1 },
    { skus: [["PPK-UREA-50", 1], ["BNH-INP42-5", 1], ["PST-REG100", 1]], w: 3 }, { skus: [["PPK-SP36-50", 1], ["PPK-UREA-50", 1]], w: 2 },
  ];
  const weighted = baskets.flatMap((b) => Array(b.w).fill(b));
  const now = Date.now();
  const jobs: { farmer: any; merchant: any; skus: [string, number][]; at: Date; ttl?: number }[] = [];
  for (const f of farmerRows) {
    const k = between(0, 4) === 0 ? 0 : between(1, 4);
    for (let i = 0; i < k; i++) {
      const daysAgo = between(0, 20);
      const hour = between(7, 16), minute = between(0, 59);
      const at = new Date(now - daysAgo * 86400e3);
      at.setHours(hour, minute, between(0, 59), 0);
      jobs.push({ farmer: f, merchant: pick(merchantsByRegency.get(f.regency)!), skus: [...pick(weighted).skus], at });
    }
  }
  // anomalies for the fraud rules
  const sragenKios = merchantRows.find((m) => m.id === "KIOS-3314-002")!;
  const sragenFarmers = farmerRows.filter((f) => f.regency === "Sragen");
  const burst = new Date(now - 3 * 86400e3); burst.setHours(9, 5, 0, 0);
  for (let i = 0; i < 30; i++) jobs.push({ farmer: sragenFarmers[i % sragenFarmers.length], merchant: sragenKios, skus: [["PPK-ORG-40", 1]], at: new Date(burst.getTime() + i * 100_000) }); // velocity: 30 invoices in 50 minutes
  const splitter = sragenFarmers[3];
  const splitAt = new Date(now - 5 * 86400e3); splitAt.setHours(14, 10, 0, 0);
  for (let i = 0; i < 3; i++) jobs.push({ farmer: splitter, merchant: sragenKios, skus: [["PPK-UREA-50", 1]], at: new Date(splitAt.getTime() + i * 6 * 60_000) });
  const klaten = farmerRows.filter((f) => f.regency === "Klaten");
  for (const f of klaten.slice(0, 2)) { const at = new Date(now - 6 * 86400e3); at.setHours(11, 20, 0, 0); jobs.push({ farmer: f, merchant: sragenKios, skus: [["PPK-NPK-50", 2]], at }); }
  const late = new Date(now - 2 * 86400e3); late.setHours(23, 35, 0, 0);
  jobs.push({ farmer: sragenFarmers[6], merchant: sragenKios, skus: [["PST-GRX1", 1]], at: late });
  jobs.sort((a, b) => a.at.getTime() - b.at.getTime());
  // farmer nonces are sequential on-chain, so purchases of the same farmer must not run concurrently: group by farmer per batch
  let done = 0, failed = 0;
  const byFarmer = new Map<string, typeof jobs>();
  for (const j of jobs) byFarmer.set(j.farmer.id, [...(byFarmer.get(j.farmer.id) ?? []), j]);
  const lanes = [...byFarmer.values()];
  await sendBatches(lanes, 12, async (lane) => {
    for (const j of lane) {
      try {
        // size the basket to what the farmer can still afford: try the planned basket, then smaller fallbacks
        const products = new Map<string, (typeof PRODUCTS)[number]>(PRODUCTS.map((p) => [p[0] as string, p]));
        const fallbacks: [string, number][][] = [j.skus, [["PPK-UREA-50", 1]], [["PPK-ORG-40", 1]], [["BNH-CHR-5", 1]], [["PST-RDM100", 1]], [["ALS-SBT", 1]]];
        let chosen: [string, number][] | null = null;
        for (const cand of fallbacks) {
          const totals: Record<string, number> = {};
          for (const [sku, qty] of cand) { const p = products.get(sku)!; totals[p[3]] = (totals[p[3]] ?? 0) + p[5] * qty; }
          if ((await coverageFor(j.farmer.address, totals)).canPay) { chosen = cand; break; }
        }
        if (!chosen) { failed++; continue; }
        const inv = await createInvoice(j.merchant.id, chosen.map(([sku, qty]) => ({ sku, qty })), { createdAt: j.at });
        await payInvoice({ invoiceId: inv.id, farmer: farmersDb.get(j.farmer.id), pin: PIN, mode: rnd() < 0.35 ? "assisted" : "scan", paidAt: new Date(j.at.getTime() + between(20, 120) * 1000) });
        done++;
      } catch (e) {
        failed++;
        if (failed <= 5) console.log(`\n  skipped (${(e as Error).message.slice(0, 80)})`);
      }
    }
  });
  console.log(`Purchases settled: ${done}, skipped: ${failed}`);

  // one settlement run for purchases older than a week, dated 7 days ago
  console.log("Indexing + first payout run");
  while ((await indexOnce()) > 0) { /* drain */ }
  const payouts = await runPayouts("operator", { at: new Date(now - 7 * 86400e3), upTo: new Date(now - 7 * 86400e3) });
  console.log(`Payouts: ${payouts.length} merchants, ${payouts.reduce((a, p) => a + p.amount, 0)} IDR`);
  while ((await indexOnce()) > 0) { /* drain */ }
  console.log(`Fraud alerts: ${await runFraudRules()}`);
  const stats = await one(`SELECT (SELECT count(*) FROM farmers) AS farmers, (SELECT count(*) FROM merchants) AS merchants, (SELECT count(*) FROM invoices WHERE status='paid') AS paid, (SELECT count(*) FROM chain_events) AS events`);
  console.log("Done:", stats);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
