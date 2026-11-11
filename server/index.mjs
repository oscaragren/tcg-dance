import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";
import { openDatabase } from "./db.mjs";
import { sendPasswordResetEmail } from "./mailer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT ?? process.env.AUTH_API_PORT ?? 4000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (IS_PRODUCTION && !process.env.AUTH_JWT_SECRET) {
  throw new Error("AUTH_JWT_SECRET must be set in production.");
}

const db = openDatabase(process.env.DB_PATH ?? path.join(workspaceRoot, "data", "tcg.db"), {
  legacyJsonDir: path.join(workspaceRoot, "data"),
});

const { app, startBackgroundJobs } = await createApp({
  db,
  clock: { now: () => Date.now() },
  random: Math.random,
  mailer: { sendPasswordResetEmail },
  config: {
    jwtSecret: process.env.AUTH_JWT_SECRET ?? "dev-only-secret-change-me",
    adminPassword: process.env.ADMIN_PASSWORD ?? "",
    corsOrigin: process.env.AUTH_CORS_ORIGIN ?? "http://localhost:5173",
    appUrl: process.env.APP_URL ?? "http://localhost:5173",
    isProduction: IS_PRODUCTION,
    distPath: path.join(workspaceRoot, "dist"),
  },
});

startBackgroundJobs();
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
