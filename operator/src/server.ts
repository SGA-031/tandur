import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { env } from "./env.ts";
import { migrate } from "./db/migrate.ts";
import { publicRoutes } from "./routes/public.ts";
import { walletRoutes } from "./routes/wallet.ts";
import { posRoutes } from "./routes/pos.ts";
import { adminRoutes } from "./routes/admin.ts";
import { startIndexer } from "./services/indexer.ts";
import { runFraudRules } from "./services/fraud.ts";
import { expireStale } from "./services/invoices.ts";
import { deployment, operatorAddress, provider } from "./services/chain.ts";

const app = Fastify({ logger: { level: "info", transport: undefined } });

await app.register(cors, { origin: true });
await app.register(fastifyStatic, { root: env.STORAGE_DIR, prefix: "/storage/", decorateReply: false });

app.setErrorHandler((err: unknown, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  const e = err as { statusCode?: number; message?: string };
  app.log.error(err);
  reply.code(e.statusCode ?? 500).send({ error: e.message ?? "Kesalahan server" });
});

await app.register(publicRoutes);
await app.register(walletRoutes, { prefix: "/wallet" });
await app.register(posRoutes, { prefix: "/pos" });
await app.register(adminRoutes, { prefix: "/admin" });

await migrate();
const net = await provider.getNetwork();
app.log.info(`ledger chainId=${net.chainId} voucher=${deployment.voucher} registry=${deployment.registry} operator=${operatorAddress}`);

startIndexer((m) => app.log.warn(m));
setInterval(() => { expireStale().catch(() => {}); }, 30_000);
setInterval(() => { runFraudRules().catch((e) => app.log.warn(`fraud rules: ${e.message}`)); }, 60_000);
setTimeout(() => runFraudRules().catch(() => {}), 8_000);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
