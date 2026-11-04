import { env } from "./env";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { prisma } from "./prisma";
import { authRouter } from "./auth";
import { syncRouter } from "./sync";
import { rateLimit } from "./limits";

const app = express();
app.disable("x-powered-by");
// Behind a proxy, req.ip is the proxy unless it is trusted; trusted when it is not really there, the address can be forged.
app.set("trust proxy", env.trustProxy);

app.use(
  helmet({
    // This is a JSON API plus one small page (/reset), which sets its own policy.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(
  cors({
    // The phone app is not a browser and needs no CORS. Only the laptop web app does.
    origin: env.corsOrigins.length ? env.corsOrigins : !env.production,
    maxAge: 600,
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));

// Every request, without its query string (the reset link carries a token there).
app.use((req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (req.path === "/health" && res.statusCode === 200) return;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
});

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

// A generous ceiling for the whole API from one address, only to stop floods. Phones sync once a minute and a whole
// site can share one public address, so this is high. Sign-in has its own, much tighter limits.
app.use(rateLimit(1200));

app.use(authRouter);
app.use(syncRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Nothing internal (stack, SQL, file paths) is ever sent to the caller.
const onError: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 413 ? "Too much data in one request" : status === 400 ? "Bad request" : status === 500 ? "Something went wrong on the server" : "Request refused" });
};
app.use(onError);

const server = app.listen(env.port, env.host, () => console.log(`API listening on http://localhost:${env.port}`));
// Slow or stalled connections are cut instead of piling up.
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 65_000;

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: finishing requests and closing`);
  // A request that never ends must not keep the server from stopping.
  setTimeout(() => process.exit(1), 15_000).unref();
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (e) => console.error("unhandled rejection", e));
