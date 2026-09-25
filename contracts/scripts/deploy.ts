import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying to ${network.name} as ${deployer.address}`);

  const Registry = await ethers.getContractFactory("TandurRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  const Voucher = await ethers.getContractFactory("TandurVoucher");
  const voucher = await Voucher.deploy(deployer.address, await registry.getAddress(), "https://tandur.id/voucher/{id}.json");
  await voucher.waitForDeployment();

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    registry: await registry.getAddress(),
    voucher: await voucher.getAddress(),
    deployedAt: new Date().toISOString(),
    deployBlock: await ethers.provider.getBlockNumber(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  // ABIs for the operator
  for (const name of ["TandurRegistry", "TandurVoucher"]) {
    const artifact = await import(`../artifacts/contracts/${name}.sol/${name}.json`);
    fs.writeFileSync(path.join(dir, `${name}.abi.json`), JSON.stringify(artifact.abi, null, 2));
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
