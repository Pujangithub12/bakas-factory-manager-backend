import "dotenv/config";

// bcrypt runs on libuv's worker threads (4 by default, shared with file and DNS work). Sign-in checks several hashes at once.
process.env.UV_THREADPOOL_SIZE ||= "8";

/**
 * Settings read once at start-up. A server that is set up wrongly should stop at the start, with a clear
 * message, not run in a weak state.
 */
const production = process.env.NODE_ENV === "production";
const problems: string[] = [];

const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) problems.push("JWT_SECRET is not set in .env");
else if (JWT_SECRET.length < 32 || /change-me/i.test(JWT_SECRET)) {
  const msg = "JWT_SECRET is too short or still the example value. Use 32 or more random characters (node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\")";
  if (production) problems.push(msg);
  else console.warn(`Warning: ${msg}`);
}

if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set in .env");

const port = process.env.PORT === undefined || process.env.PORT === "" ? 4000 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push("PORT must be a number from 1 to 65535");

if (problems.length) {
  for (const p of problems) console.error(`Config error: ${p}`);
  process.exit(1);
}

export const env = {
  production,
  jwtSecret: JWT_SECRET,
  port,
  host: process.env.HOST || "0.0.0.0",
  /** Comma-separated browser origins allowed to call the API (the laptop web app). Empty = any origin in development, none in production. */
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  /** Number of reverse proxies in front of this server (nginx, a load balancer). 0 = none: req.ip is the real caller. */
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
};
