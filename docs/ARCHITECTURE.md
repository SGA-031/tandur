# Architecture

## Actors and trust

| Actor | Holds | Can |
|---|---|---|
| Ministry (Kementan) | validator node, Lumbung admin login, PAUSER role | see everything, pause, approve allocations |
| Operator (government-controlled org) | validator node, operator key (MINTER, RELAYER, SETTLEMENT, COMPLIANCE, REGISTRAR), custody vault, PII vault | enrol, issue, relay spends, settle merchants, freeze/clawback with reason hash |
| Auditor (BPKP) | validator node, read-only login | independently replay the chain, verify invoice hashes |
| Bank | validator node | pay merchants against `Redeemed` events |
| Farmer | PIN + device; an on-chain account whose key is custodied | authorise spends (EIP-712 signature), read own history |
| Merchant (KDMP / kiosk) | POS login; an on-chain account | issue invoices, receive vouchers, get fiat T+1 |

The chain earns its place through the multi-party validator set: no single organisation can rewrite issuance, spending or redemption, and the auditor and bank read the same ledger the ministry does.

## Data flow of one purchase

1. POS builds the invoice from the catalogue (HET ceilings enforced). Operator stores the canonical JSON at `storage/invoices/<hash>.json` and returns an EMVCo-style QR carrying merchant account, invoice id, amount, category totals, hash and expiry.
2. Wallet scans, decodes, and asks the operator for the invoice; it refuses if the QR hash or amount differ from the stored document.
3. Farmer enters PIN. The operator decrypts the farmer's key with `KEK(VAULT_SECRET, PIN)`, signs one `SpendAuth` per voucher type used, and calls `spendMulti`.
4. The contract checks: relayer role, deadline, sequential nonce, invoice part unused, farmer active, merchant whitelisted, neither frozen, type valid window, balance, and that `ecrecover(digest) == farmer`. It moves the balance and emits `Spent(farmer, merchant, typeId, amount, invoiceHash, relayer)`.
5. Operator marks the invoice paid with tx hash and block, sends the SMS receipt, and the POS (polling) shows success.
6. Indexer copies every event into Postgres. Fraud rules and reconciliation run over the indexed events and the invoice store.
7. Settlement burns each merchant's balance (`Redeemed`) and records a bank transfer keyed to the burn transaction.

## On-chain model (`TandurVoucher`)

- ERC-1155 with `ERC1155Supply`; `safeTransferFrom` / approvals revert (non-transferable).
- `VoucherType { categoryCode, season, validFrom, validUntil, perFarmerCap }`, one id per type.
- `issuedTo[type][farmer]`, `spentBy[type][farmer]`, `nonces[farmer]`, `frozen[account]`, `invoiceUsed[hash]`, `invoicePartUsed[keccak(hash,type)]`.
- Roles: `MINTER`, `RELAYER`, `SETTLEMENT`, `COMPLIANCE`, `PAUSER`, `DEFAULT_ADMIN` (production: multisig + timelock).
- Events are the audit trail: `VoucherTypeCreated`, `Issued`, `Spent`, `Redeemed`, `Frozen`, `Clawback`, `Expired`, plus registry events.

## Off-chain model (Postgres)

`farmers` (PII + encrypted key), `merchants`, `admins`, `products` (HET), `voucher_types`, `allocations`, `invoices` (lines, totals, canonical document, hash, tx), `chain_events` (indexed), `payouts`, `fraud_alerts`, `notifications`, `audit_log`, `invoice_counters`.

## Fraud rules (`operator/src/services/fraud.ts`)

merchant concentration, velocity, split transactions, same-day full drain, off-hours, round amounts, out-of-region. Each produces an upserted alert with severity and evidence; Lumbung lets staff move alerts through open → reviewing → closed.

## Reconciliation (`operator/src/services/reconcile.ts`)

Per voucher type: on-chain `totalSupply` must equal `issued − redeemed − clawback − expired` from indexed events. Sum of paid invoices must equal sum of `Spent`. Sum of payouts must equal sum of `Redeemed`. Any mismatch is a red banner; production would block payouts on it.

## Production path

- Validators on-prem / sovereign cloud in Indonesia (PP 71/2019), 5–7 organisations, QBFT.
- Operator key in HSM; per-farmer keys in MPC or ERC-4337 smart accounts with operator guardian; device binding + in-person re-bind.
- Blockscout for auditors; FireFly for event plumbing if desired (both used in Bank Indonesia's Project Garuda).
- Farmer registry sourced from e-RDKK; merchants from Koperasi Desa Merah Putih and kios pupuk lengkap registries; assisted KTP mode at every POS for phone-less farmers.
- Legal opinion on closed-loop e-money status (PBI 23/6/2021) and QR branding; DPO and PDP Law compliance programme.
