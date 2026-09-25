import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env", override: true });

// Well-known Hardhat dev key #0. Prototype only: the real operator key lives in an HSM.
const OPERATOR_KEY = process.env.OPERATOR_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const config: HardhatUserConfig = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    besu: {
      url: process.env.RPC_URL ?? "http://127.0.0.1:8545",
      chainId: 6221,
      accounts: [OPERATOR_KEY],
      gasPrice: 0,
    },
  },
};
export default config;
