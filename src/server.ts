import { type Client, EmbedBuilder } from "discord.js";
import express, { type Express, type Request, type Response } from "express";
import type { Server } from "node:http";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DmRequestBody {
  discordUserId?: string;
  title?: string;
  body?: string;
  url?: string;
  color?: number;
  fields?: EmbedField[];
}

// Discord API error codes that mean "this user can't receive a DM from us",
// as opposed to a transient/send failure.
const USER_UNREACHABLE_CODES = new Set([10013, 50007, 50001, 10004]);

export function createServer(client: Client): Express {
  const app = express();
  app.use(express.json());

  app.post("/dm", async (req: Request<unknown, unknown, DmRequestBody>, res: Response) => {
    const secret = process.env.BOT_SERVICE_SECRET;
    if (!secret || req.header("X-Bot-Secret") !== secret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const { discordUserId, title, body, url, color, fields } = req.body ?? {};
    if (!discordUserId || !title || !body) {
      res.status(400).json({ error: "discordUserId, title, and body are required" });
      return;
    }

    // A native embed renders as a real preview box (clickable title, body as
    // description, metadata as fields) without relying on Discord
    // auto-embedding a link pasted into plain message content — which it
    // doesn't do for markdown-style links, and which wouldn't produce
    // anything useful here anyway.
    const embed = new EmbedBuilder().setTitle(title).setDescription(body);
    if (url) {
      embed.setURL(url);
    }
    if (typeof color === "number") {
      embed.setColor(color);
    }
    if (Array.isArray(fields) && fields.length > 0) {
      embed.addFields(fields);
    }

    try {
      const user = await client.users.fetch(discordUserId);
      const message = await user.send({ embeds: [embed] });
      res.status(200).json({ success: true, discordMessageId: message.id });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== undefined && USER_UNREACHABLE_CODES.has(code)) {
        res.status(404).json({ error: "Discord user not found or cannot be messaged" });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[server] failed to send DM to ${discordUserId}: ${message}`);
      res.status(500).json({ error: "failed to send DM" });
    }
  });

  return app;
}

export function startServer(client: Client, port: number): Server {
  const app = createServer(client);
  return app.listen(port, () => {
    console.log(`[server] listening on port ${port}`);
  });
}
