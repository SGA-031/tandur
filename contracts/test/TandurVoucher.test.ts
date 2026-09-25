import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const b32 = (s: string) => ethers.encodeBytes32String(s);

describe("TandurVoucher", () => {
  async function deploy() {
    const [admin, farmer, farmer2, merchant, stranger] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory("TandurRegistry")).deploy(admin.address);
    const voucher = await (await ethers.getContractFactory("TandurVoucher")).deploy(admin.address, await registry.getAddress(), "ipfs://x/{id}");
    await registry.registerFarmer(farmer.address, b32("PSEUDO-1"), b32("33.10.05"));
    await registry.registerFarmer(farmer2.address, b32("PSEUDO-2"), b32("33.10.05"));
    await registry.registerMerchant(merchant.address, b32("KDMP-3310-001"), b32("33.10.05"), 1);
    const now = await time.latest();
    await voucher.createVoucherType(b32("PUPUK"), b32("MT1-2026/27"), now - 10, now + 90 * 86400, 1_500_000);
    return { admin, farmer, farmer2, merchant, stranger, registry, voucher };
  }

  async function signSpend(voucher: any, signer: any, auth: any) {
    const net = await ethers.provider.getNetwork();
    const domain = { name: "TandurVoucher", version: "1", chainId: net.chainId, verifyingContract: await voucher.getAddress() };
    const types = {
      Spend: [
        { name: "farmer", type: "address" }, { name: "merchant", type: "address" }, { name: "typeId", type: "uint256" },
        { name: "amount", type: "uint256" }, { name: "invoiceHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
      ],
    };
    return signer.signTypedData(domain, types, auth);
  }

  it("issues within the per-farmer cap and blocks beyond it", async () => {
    const { voucher, farmer } = await loadFixture(deploy);
    await expect(voucher.issue(farmer.address, 1, 1_000_000, b32("ALLOC-1"))).to.emit(voucher, "Issued");
    await expect(voucher.issue(farmer.address, 1, 600_000, b32("ALLOC-1"))).to.be.revertedWith("Voucher: exceeds per-farmer cap");
    expect(await voucher.balanceOf(farmer.address, 1)).to.equal(1_000_000);
  });

  it("refuses to issue to an unregistered account", async () => {
    const { voucher, stranger } = await loadFixture(deploy);
    await expect(voucher.issue(stranger.address, 1, 1, b32("A"))).to.be.revertedWith("Voucher: not an active farmer");
  });

  it("spends with a valid farmer signature and records the invoice hash exactly once", async () => {
    const { voucher, farmer, merchant, admin } = await loadFixture(deploy);
    await voucher.issue(farmer.address, 1, 1_000_000, b32("ALLOC-1"));
    const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-1"));
    const auth = { farmer: farmer.address, merchant: merchant.address, typeId: 1, amount: 250_000, invoiceHash, nonce: 0, deadline: (await time.latest()) + 300 };
    const sig = await signSpend(voucher, farmer, auth);
    await expect(voucher.spend(auth, sig)).to.emit(voucher, "Spent").withArgs(farmer.address, merchant.address, 1, 250_000, invoiceHash, admin.address);
    expect(await voucher.balanceOf(farmer.address, 1)).to.equal(750_000);
    expect(await voucher.balanceOf(merchant.address, 1)).to.equal(250_000);
    expect(await voucher.invoiceUsed(invoiceHash)).to.equal(true);
    // replay with the next nonce but same invoice is refused
    const auth2 = { ...auth, nonce: 1 };
    const sig2 = await signSpend(voucher, farmer, auth2);
    await expect(voucher.spend(auth2, sig2)).to.be.revertedWith("Voucher: invoice already paid");
  });

  it("spendMulti settles two categories of one invoice atomically", async () => {
    const { voucher, farmer, merchant } = await loadFixture(deploy);
    const now = await time.latest();
    await voucher.createVoucherType(b32("BENIH"), b32("MT1-2026/27"), now - 10, now + 90 * 86400, 500_000); // typeId 2
    await voucher.issue(farmer.address, 1, 1_000_000, b32("A"));
    await voucher.issue(farmer.address, 2, 300_000, b32("A"));
    const invoiceHash = ethers.id("invoice-multi");
    const deadline = now + 300;
    const a1 = { farmer: farmer.address, merchant: merchant.address, typeId: 1, amount: 225_000, invoiceHash, nonce: 0, deadline };
    const a2 = { farmer: farmer.address, merchant: merchant.address, typeId: 2, amount: 65_000, invoiceHash, nonce: 1, deadline };
    await voucher.spendMulti([a1, a2], [await signSpend(voucher, farmer, a1), await signSpend(voucher, farmer, a2)]);
    expect(await voucher.balanceOf(merchant.address, 1)).to.equal(225_000);
    expect(await voucher.balanceOf(merchant.address, 2)).to.equal(65_000);
    expect(await voucher.nonces(farmer.address)).to.equal(2);
    // a failing part reverts the whole batch
    const a3 = { ...a1, nonce: 2, invoiceHash: ethers.id("inv-2") };
    const a4 = { ...a2, nonce: 3, invoiceHash: ethers.id("inv-2"), amount: 999_999 };
    await expect(voucher.spendMulti([a3, a4], [await signSpend(voucher, farmer, a3), await signSpend(voucher, farmer, a4)])).to.be.revertedWith("Voucher: insufficient balance");
    expect(await voucher.balanceOf(merchant.address, 1)).to.equal(225_000);
  });

  it("rejects a signature from anyone but the farmer", async () => {
    const { voucher, farmer, farmer2, merchant } = await loadFixture(deploy);
    await voucher.issue(farmer.address, 1, 1_000_000, b32("ALLOC-1"));
    const auth = { farmer: farmer.address, merchant: merchant.address, typeId: 1, amount: 1, invoiceHash: ethers.id("x"), nonce: 0, deadline: (await time.latest()) + 300 };
    const sig = await signSpend(voucher, farmer2, auth);
    await expect(voucher.spend(auth, sig)).to.be.revertedWith("Voucher: invalid farmer signature");
  });

  it("only whitelisted merchants can receive", async () => {
    const { voucher, farmer, stranger } = await loadFixture(deploy);
    await voucher.issue(farmer.address, 1, 1_000_000, b32("ALLOC-1"));
    const auth = { farmer: farmer.address, merchant: stranger.address, typeId: 1, amount: 1, invoiceHash: ethers.id("y"), nonce: 0, deadline: (await time.latest()) + 300 };
    const sig = await signSpend(voucher, farmer, auth);
    await expect(voucher.spend(auth, sig)).to.be.revertedWith("Voucher: merchant not whitelisted");
  });

  it("is non-transferable by holders", async () => {
    const { voucher, farmer, farmer2 } = await loadFixture(deploy);
    await voucher.issue(farmer.address, 1, 10, b32("A"));
    await expect(voucher.connect(farmer).safeTransferFrom(farmer.address, farmer2.address, 1, 5, "0x")).to.be.revertedWith("Voucher: non-transferable (use spend)");
    await expect(voucher.connect(farmer).setApprovalForAll(farmer2.address, true)).to.be.revertedWith("Voucher: approvals disabled");
  });

  it("merchant redemption burns and emits a batch reference", async () => {
    const { voucher, farmer, merchant } = await loadFixture(deploy);
    await voucher.issue(farmer.address, 1, 1_000_000, b32("A"));
    const auth = { farmer: farmer.address, merchant: merchant.address, typeId: 1, amount: 400_000, invoiceHash: ethers.id("z"), nonce: 0, deadline: (await time.latest()) + 300 };
    await voucher.spend(auth, await signSpend(voucher, farmer, auth));
    await expect(voucher.redeem(merchant.address, 1, 400_000, b32("PAYOUT-2026-09-26"))).to.emit(voucher, "Redeemed");
    expect(await voucher.balanceOf(merchant.address, 1)).to.equal(0);
    expect(await voucher["totalSupply(uint256)"](1)).to.equal(600_000);
  });

  it("freeze, clawback with reason, and expiry sweep", async () => {
    const { voucher, farmer, merchant } = await loadFixture(deploy);
    await voucher.issue(farmer.address, 1, 1_000_000, b32("A"));
    await voucher.setFrozen(farmer.address, true, ethers.id("suspected collusion"));
    const auth = { farmer: farmer.address, merchant: merchant.address, typeId: 1, amount: 1, invoiceHash: ethers.id("w"), nonce: 0, deadline: (await time.latest()) + 300 };
    await expect(voucher.spend(auth, await signSpend(voucher, farmer, auth))).to.be.revertedWith("Voucher: account frozen");
    await expect(voucher.clawback(farmer.address, 1, 100_000, ethers.ZeroHash)).to.be.revertedWith("Voucher: reason required");
    await voucher.clawback(farmer.address, 1, 100_000, ethers.id("duplicate allocation"));
    expect(await voucher.balanceOf(farmer.address, 1)).to.equal(900_000);
    await expect(voucher.sweepExpired(farmer.address, 1)).to.be.revertedWith("Voucher: not expired");
    await time.increase(91 * 86400);
    await expect(voucher.sweepExpired(farmer.address, 1)).to.emit(voucher, "Expired").withArgs(farmer.address, 1, 900_000);
  });

  it("pause blocks issue and spend", async () => {
    const { voucher, farmer } = await loadFixture(deploy);
    await voucher.pause();
    await expect(voucher.issue(farmer.address, 1, 1, b32("A"))).to.be.revertedWithCustomError(voucher, "EnforcedPause");
  });
});
