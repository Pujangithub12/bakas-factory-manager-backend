import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./prisma";
import { authRouter } from "./auth";
import { syncRouter } from "./sync";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

app.use(authRouter);
app.use(syncRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, "0.0.0.0", () => console.log(`API listening on http://localhost:${port}`));
