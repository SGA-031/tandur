import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.ts";

const deploymentsDir = path.resolve(import.meta.dirname, "../../../contracts/deployments");
export const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "besu.json"), "utf8")) as {
  chainId: number; deployer: string; registry: string; voucher: string; deployBlock: number;
};
const voucherAbi = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "TandurVoucher.abi.json"), "utf8"));
const registryAbi = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "TandurRegistry.abi.json"), "utf8"));

export const provider = new ethers.JsonRpcProvider(env.RPC_URL, { chainId: env.CHAIN_ID, name: "tandur" }, { staticNetwork: true, polling: true, pollingInterval: 1000 });
const operatorWallet = new ethers.Wallet(env.OPERATOR_KEY, provider);
export const operator = new ethers.NonceManager(operatorWallet);
export const operatorAddress = operatorWallet.address;

export const voucher = new ethers.Contract(deployment.voucher, voucherAbi, operator);
export const registry = new ethers.Contract(deployment.registry, registryAbi, operator);
export const voucherRead = voucher.connect(provider) as ethers.Contract;
export const registryRead = registry.connect(provider) as ethers.Contract;

/** Zero gas price: private enterprise chain. Legacy tx type keeps Besu happy. */
export const TX = { gasPrice: 0n } as const;

export const b32 = (s: string) => ethers.encodeBytes32String(s);
export const fromB32 = (h: string) => { try { return ethers.decodeBytes32String(h); } catch { return h; } };
export const reasonHash = (reason: string) => ethers.id(reason);

export interface SpendAuth {
  farmer: string; merchant: string; typeId: number; amount: number; invoiceHash: string; nonce: number; deadline: number;
}

const SPEND_TYPES = {
  Spend: [
    { name: "farmer", type: "address" }, { name: "merchant", type: "address" }, { name: "typeId", type: "uint256" },
    { name: "amount", type: "uint256" }, { name: "invoiceHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
  ],
};

export async function signSpend(farmerWallet: ethers.Wallet, auth: SpendAuth): Promise<string> {
  const domain = { name: "TandurVoucher", version: "1", chainId: env.CHAIN_ID, verifyingContract: deployment.voucher };
  return farmerWallet.signTypedData(domain, SPEND_TYPES, auth);
}

export async function balancesOf(address: string, typeIds: number[]): Promise<number[]> {
  if (typeIds.length === 0) return [];
  const res: bigint[] = await voucherRead.balanceOfBatch(typeIds.map(() => address), typeIds);
  return res.map((b) => Number(b));
}

export async function ledgerStatus() {
  const [blockNumber, peersHex, validators] = await Promise.all([
    provider.getBlockNumber(),
    provider.send("net_peerCount", []),
    provider.send("qbft_getValidatorsByBlockNumber", ["latest"]).catch(() => []),
  ]);
  return { chainId: env.CHAIN_ID, blockNumber, peers: parseInt(peersHex, 16), validators, voucherAddress: deployment.voucher, registryAddress: deployment.registry };
}

/** Wait for a receipt and throw a readable error when the tx reverted. */
export async function confirm(txPromise: Promise<ethers.ContractTransactionResponse>): Promise<ethers.ContractTransactionReceipt> {
  const tx = await txPromise;
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`Transaction ${tx.hash} reverted`);
  return receipt;
}

/** Turn a revert into the contract's reason string (e.g. "Voucher: insufficient balance"). */
export function revertReason(e: unknown): string {
  const err = e as any;
  return err?.reason ?? err?.shortMessage ?? err?.info?.error?.message ?? (err?.message ?? String(e)).slice(0, 200);
}
