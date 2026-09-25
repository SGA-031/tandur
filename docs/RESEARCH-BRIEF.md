# Research brief: blockchain-backed closed-loop agri-input wallet for Indonesian farmers
Compiled 2026-09-25 from three research passes (global programs, technical architecture, Indonesian regulation + naming).

## A. Global precedents and what they teach

| Program | Tech | Scale | Outcome | Lesson |
|---|---|---|---|---|
| India e-RUPI (NPCI, 2021-) | SMS/QR prepaid voucher, bank-issued, merchant scans + OTP | 1.45M vouchers in UP ultrasound scheme | Only ~47% redeemed; bank-level redemption 6-8% | Issuance is easy, redemption is the bottleneck. KPI = redemption rate. MCC-level restriction too coarse. |
| WFP Building Blocks (Jordan/Bangladesh 2017-) | Private PoA Ethereum, multi-org validators, PII off-chain, iris auth at supermarket POS | 1M+/month, 25M tx, USD 555M | 98% fee cut, USD 288M duplicate aid avoided | Chain earns its keep through multi-party reconciliation and dedup, not single-operator record-keeping. |
| Singapore MAS Purpose Bound Money (2022-) | ERC-1155 "wrapper" token carrying conditions (expiry, merchant whitelist, category) around underlying money; open source | Pilots: RedeemSG vouchers, Grab, Amazon escrow | Reference design for programmable vouchers | Separate condition layer from money layer. Merchant unwraps to fiat same day. |
| Thailand 10,000-baht wallet (2024-25) | Planned blockchain, geo+category restricted | 14.45M recipients | Blockchain dropped, paid as cash via PromptPay; digital phase suspended | Over-restriction + slow merchant settlement leads to political retreat to cash. |
| Indonesia Kartu Tani (2017-24) | Bank debit card + EDC at kiosk, e-RDKK quota | 9.3M cards printed, ~1.2M active | Replaced by i-Pubers: KTP/NIK scan on kiosk's Android app, offline mode | Credential = what farmers already carry (KTP). Device = kiosk's, not farmer's. Register (e-RDKK) is the real failure surface. |
| Nigeria GES e-wallet (2012-16) | SMS voucher, private agro-dealers | 7-12M farmers, USD 1bn inputs | Yields +38%; killed by N67-76bn government arrears to dealers | Pay merchants fast. Arrears collapse the merchant network. |
| Zambia FISP e-voucher | Visa-type card via banks | Nationwide 2017/18 | Connectivity, fake agro-dealers, dealer-ministry collusion; 40% reverted | Merchant KYC + geo-anchoring + stock reconciliation. |
| Malawi FISP/AIP | App + biometric | 1.22M | Reverting to paper coupons 2026/27 | Network glitches create both delays and corruption. |
| Kenya e-voucher | Safaricom SMS | Pilot | Reverted; later bulk cooperative vouchers double-redeemed | Bind credits per individual, never bulk to groups. |
| China e-CNY | Category/time-bound coupons, SIM-card hard wallet for offline NFC | Shenzhen CNY 570M across 73 campaigns | Works at scale | Offline-capable hardware matters for rural. |
| Nigeria eNaira / Bahamas Sand Dollar | Retail CBDC | 13M wallets / <1% of currency | 98.5% never used | No use case + few merchants = dead wallet. |
| Brazil Caixa Tem | App benefit account | Tens of millions | R$2bn fraud via insider data sales and account takeover by changing phone/email | Device re-binding must require in-person verification. |

### Top 12 best practices to adopt
1. Authenticate with what the farmer already has (KTP/NIK against e-RDKK) on the merchant's device; the phone is optional, never a gate.
2. Redemption rate is the primary KPI; alert on issued-but-unredeemed credits by district.
3. Pay merchants T+1 in fiat against on-chain burn events.
4. Credits bound per individual farmer, never bulk to a cooperative.
5. Restrict at SKU/category level with per-farmer per-season quotas, not merchant category alone.
6. Offline-tolerant redemption: store-and-forward with signed receipts; SMS confirmation.
7. Merchant KYC, geo-anchoring, stock-in vs redemptions-out reconciliation.
8. PII off-chain; only pseudonymous IDs, issuance, redemption events and invoice hashes on-chain.
9. Multi-party validators (ministry, operator, auditor, bank, provinces) so the ledger delivers reconciliation value.
10. Voucher as a standard wrapper token (PBM pattern) so other wallets/banks can hold it later.
11. Village-level grievance path and a logged manual-redemption fallback.
12. Bahasa/local-language UX, SMS receipt after every redemption with remaining quota; training budget equal to tech budget.

### Top 8 failure modes to design against
Merchant-official collusion and fake merchants; cash-out arbitrage; ghost/deceased beneficiaries; account takeover and insider leakage; POS connectivity failure; government arrears to merchants; over-restriction plus slow settlement; blockchain as gimmick with no external validators.

## B. Indonesian regulatory and market context
- **Crypto as payment is banned** (PBI 18/40/2016, PBI 19/12/2017; rupiah sole legal tender, UU 7/2011; P2SK Law 4/2023 moved crypto-asset oversight to OJK but kept the ban). The credit must be framed as a **rupiah-denominated subsidy entitlement / closed-loop voucher**, never a "coin" or "token" in product copy.
- **E-money licensing** (PBI 23/6/2021): closed-loop float above IDR 1bn needs a Bank Indonesia licence. A subsidy program exceeds that on day one and third-party merchants make it look open-loop. Mitigation: structure as a non-monetary entitlement (farmer never holds redeemable money; operator pays merchants against verified invoices) or front it with a licensed bank/PJP. Needs legal opinion.
- **QRIS** is mandatory only for licensed payment providers. Recommended: own QR in EMVCo MPM TLV grammar (so future QRIS convergence is trivial) without QRIS branding.
- **Digital Rupiah (Project Garuda)**: wholesale PoC done Dec 2024 on Hyperledger Besu + R3 Corda (Kaleido, FireFly); retail not before 2029-30. Besu is therefore a BI-validated stack.
- **PDP Law 27/2022** in force since Oct 2024: NIK and transaction history are personal data; DPO mandatory; breach notice 3x24h; erasure rights conflict with immutability, solved by pseudonymous on-chain IDs plus deletable off-chain mapping ("cryptographic erasure"). **PP 71/2019**: public-scope systems must host data in Indonesia.
- **Subsidy machinery**: 2025 fertilizer subsidy 9.55Mt / IDR 46.8tn, ~14M farmers in e-RDKK across 5,995 sub-districts. Perpres 6/2025 simplified governance; Perpres 113/2025 (from 1 Jan 2026) moved to commercial-value payment model. Redemption today via Pupuk Indonesia's i-Pubers kiosk app with KTP.
- **Koperasi Desa Merah Putih (KDMP)**: launched Jul 2025, 80,000 target; Perpres 82/2026 (Sep 2026) makes them official distributors of subsidised fertilizer, LPG, rice, cooking oil. These are the natural designated merchants; a supervision system for them is an explicit open need.
- **Farmer readiness**: 28.19M farm operators, ~40% over 55, 46.8% use digital tech; rural internet 77%; blank spots persist on outer islands. Agri-fintech scandals (eFishery fabricated 75% of revenue, TaniHub collapse) make immutable invoices a direct selling point.
- Blockchain is a priority technology in Indonesia Digital Vision 2045; no Kementan blockchain program exists yet.

## C. Recommended architecture
1. **Ledger**: Hyperledger Besu private network, QBFT, 5-7 validators (Ministry, operator, state auditor BPKP, partner bank, provinces), observer nodes for explorer + indexer. Throughput need <100 TPS peak; Besu QBFT does 200-1,000. Apache-2.0, deepest Indonesian talent pool (Solidity), aligns with Project Garuda.
2. **Token**: ERC-1155 purpose-bound voucher (MAS PBM / ERC-7291 pattern) with OpenZeppelin AccessControl + Pausable + ERC1155Supply. One token ID per category x season (fertilizer, seed, tools, ...) each with cap, expiry, HET price ceiling. Transfers allowed only farmer->whitelisted merchant and merchant->operator (redeem/burn). Roles: MINTER/BURNER (operator treasury multisig), REGISTRAR (whitelists), COMPLIANCE (freeze/clawback with reason hash), PAUSER, upgrade admin behind Timelock. Auditor = read-only node.
3. **Keys**: custodial at launch (operator HSM/MPC signing service); farmer auth = 6-digit PIN + device-bound key + optional biometric; never SMS OTP for spend; device re-bind requires in-person KTP check + 24h freeze. Assisted mode: merchant POS captures KTP/NIK + PIN for phone-less farmers. Migrate to ERC-4337 smart accounts with operator guardian in phase 2.
4. **QR**: primary merchant-presented dynamic QR (EMVCo MPM TLV: merchant address, invoice ID, amount, category breakdown, hash); farmer scans, sees Bahasa summary, PIN, backend signs spend; POS confirms via event in 2-4s. Secondary consumer-presented signed QR for farmer-offline; on-chain nonce registry for replay. Optional capped offline balance later.
5. **Invoices**: SHA-256 of canonical invoice JSON + category totals on-chain; full line items, photos, geotag in in-country S3-compatible store with object lock keyed by content hash. No PII on-chain.
6. **Merchant POS**: Android-class device (same as i-Pubers kiosks): catalogue with SKU + HET ceilings, dynamic QR, event listener, offline queue, evidence capture, daily redemption view. Merchant burns for redemption; bank payout keyed to burn tx hash.
7. **Dashboard**: custom indexer (viem/ethers -> PostgreSQL) + Blockscout explorer for auditors. Views: spend by farmer/region/product/merchant, budget burn-down, redemption rate, fraud scores (velocity, merchant concentration, split transactions, geotag distance, off-hours), nightly on-chain vs off-chain vs bank reconciliation that blocks payouts on mismatch.
8. **Open-source starting points**: OpenZeppelin, GovTechSG/cbdc-purpose-bound-money, PurposeBoundMoney/PBM (ERC-7291), ERC-3643 freeze/recovery semantics, Besu quickstart + Helm, Hyperledger FireFly, Blockscout, muhakmal/qris-parser (EMVCo TLV).

## D. Naming
| Candidate | Meaning | Conflicts | Domains |
|---|---|---|---|
| Tandur | Javanese/Sundanese "to plant rice" | Small crop-mgmt Play Store app owns tandur.id | tandurpay.id/.com, tandurtani.id available |
| Benih (BenihTani) | seed | none as app; benih.id taken | benihtani.id/.com available |
| SawahKu | my paddy | none | sawahku.id/.co.id available; rice-centric |
| Lumbung | granary | "Lumbung Pangan" Kementan program name | lumbung.id available |
| TaniPay / Dompet Tani | farmer pay/wallet | crowded "Tani" space (TaniHub collapse, KoltiPay exists) | tanipay.id available |
| Anything with Koin/Token | | signals crypto; avoid given BI stance | |

Top pick: farmer app **Tandur** (TandurPay), central dashboard **Lumbung** ("the granary that holds every entitlement and invoice"). Alternates: BenihTani, SawahKu; dashboard alternates PantauTani, JagaTani.
