# Tandur + Lumbung

**Tandur** (Javanese/Sundanese: *to plant rice*) is a purpose-bound subsidy wallet for Indonesian farmers.
**Lumbung** (*granary*) is the central government dashboard that sees every entitlement, purchase and invoice.
Both sit on a permissioned **Hyperledger Besu** ledger so the trail cannot be edited after the fact.

```
Government budget ──► Operator mints entitlement ──► Farmer wallet (Tandur)
                                                          │ scans invoice QR, confirms with PIN
                                                          ▼
                       Merchant POS (Tandur Kasir) ◄── farmer-signed spend relayed to ledger
                                │ Redeemed event ──► operator pays fiat T+1
                                ▼
                       Lumbung dashboard: spend by who / where / what, invoices, alerts, reconciliation
```

## What is in the box

| Part | Path | Stack |
|---|---|---|
| Ledger | `chain/` | Besu QBFT, 4 validators (ministry, operator, auditor, bank), chain id 6221, zero gas |
| Contracts | `contracts/` | Solidity 0.8.24, OpenZeppelin 5: `TandurRegistry` (who may hold / accept), `TandurVoucher` (ERC-1155 purpose-bound voucher, EIP-712 farmer authorisation, freeze / clawback / expiry / pause) |
| Operator API | `operator/` | Fastify + Postgres: custody vault, enrolment, invoice store (content-addressed), payment relay, chain indexer, fraud rules, reconciliation, settlement |
| Farmer wallet | `apps/wallet/` | React PWA, Bahasa Indonesia, QR scan, PIN, receipts with ledger proof |
| Merchant POS | `apps/pos/` | React, catalogue with HET ceilings, dynamic invoice QR, assisted KTP mode, settlement view |
| Dashboard | `apps/lumbung/` | React + Recharts: KPIs, spend explorer, farmers, merchants, invoices with verification, ledger explorer, alerts, reconciliation, payouts, allocations |
| Shared | `packages/shared/` | DTOs, categories, invoice canonicalisation + SHA-256, EMVCo-style QR codec, design tokens |
| Research | `docs/RESEARCH-BRIEF.md` | Global precedents, Indonesian regulation, architecture rationale, naming |

## Run it

Prerequisites: Node 20+, Docker Desktop.

```bash
npm install
npm run chain:up            # generates QBFT keys + genesis, starts 4 validators + Postgres
npm run contracts:deploy    # deploys to the local chain, writes contracts/deployments/besu.json
npm run operator:seed       # registers 72 farmers + 8 merchants on-chain, issues allocations, replays 3 weeks of purchases
npm run dev                 # operator :4600, wallet :5171, POS :5172, Lumbung :5173
```

Demo logins

| App | Credentials |
|---|---|
| Tandur wallet | NIK `3310131310760001`, PIN `123456` (Sutrisno, Klaten). Every seeded farmer uses PIN 123456. |
| Tandur Kasir | `kdmp-klaten` / `tandur123` (also `kios-sragen`, `kdmp-ngawi`, `kdmp-jember`, `kdmp-baturaja`, `kios-banyuasin`, `kios-delanggu`, `kdmp-sragen`) |
| Lumbung | `admin` / `lumbung123` (also `operator`, `auditor`) |

End-to-end demo on one machine: open the POS, build a cart, press *Buat QR pembayaran*, press *Salin kode QR*; open the wallet, *Pindai QR* → *Tempel kode*, paste, confirm with PIN 123456. The POS flips to paid with the transaction hash; Lumbung shows the invoice with its verification panel and the `Spent` event.

`npm run reset` wipes the chain and database and reseeds. `npm run contracts:test` runs the Hardhat suite.

## Design decisions (short version; the long version is in docs/)

- **It is a voucher, not money.** Bank Indonesia bans crypto as a payment instrument, so the on-chain unit is a rupiah-denominated subsidy entitlement. Vouchers cannot be transferred between holders: the only moves are issue, spend (farmer → whitelisted merchant), redeem (merchant → burn, operator pays fiat), and compliance actions.
- **Farmer signs, operator relays.** Every spend carries the farmer's EIP-712 signature over the exact invoice hash; the ledger verifies it. The key is custodied by the operator but encrypted with the farmer's PIN, so neither side can spend alone.
- **Invoices are content-addressed.** The canonical invoice JSON is hashed (SHA-256); the hash is in the QR, in the `Spent` event, and is the file name in the document store. Lumbung recomputes the hash on every view.
- **No PII on-chain.** Farmers appear as pseudonymous ids and accounts; the NIK mapping lives in the operator's vault and can be erased (PDP Law 27/2022).
- **Categories with caps and windows.** One token id per (category, season) with a per-farmer cap, validity window and expiry sweep, following the MAS Purpose Bound Money pattern.
- **The dashboard's headline KPI is activation**, not issuance, because every e-voucher programme studied failed on redemption rather than on distribution.

## Prototype limits

- Keys: the operator key is the public Hardhat dev key; production uses an HSM and a validator set run by separate organisations.
- Seed timestamps: invoice dates are backdated for the dashboard's time series; block timestamps are real (the seed ran today).
- SMS is mocked into the wallet inbox. Bank settlement is mocked with a reference number, keyed to real `Redeemed` transactions.
- QRIS: the QR uses EMVCo TLV grammar but is deliberately not QRIS-branded; riding QRIS needs a licensed payment provider.
