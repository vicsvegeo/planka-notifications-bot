import "dotenv/config";
import { createClient, registerConnectionLogging, startBot } from "./bot.js";
import { testConnection } from "./db.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("DISCORD_BOT_TOKEN environment variable is not set");
    process.exit(1);
  }

  if (!process.env.BOT_SERVICE_SECRET) {
    console.error("BOT_SERVICE_SECRET environment variable is not set");
    process.exit(1);
  }

  try {
    await testConnection();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db] connection check failed: ${message}`);
  }

  const client = createClient();
  registerConnectionLogging(client);
  await startBot(client, token);

  const port = Number(process.env.PORT) || 4000;
  startServer(client, port);
}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandled rejection]", reason);
});

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
