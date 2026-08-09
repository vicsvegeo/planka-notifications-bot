import { type Client, Events, type Interaction, MessageFlags } from "discord.js";
import { getPool } from "./db.js";

const DURATION_MS: Record<string, number> = {
  "3d": 3 * 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "2w": 14 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
};

interface ParsedSnoozeCustomId {
  targetId: string;
  duration: string;
}

function parseSnoozeCustomId(customId: string, prefix: string): ParsedSnoozeCustomId | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== prefix) {
    return null;
  }

  const [, targetId, duration] = parts;
  if (!targetId || !DURATION_MS[duration]) {
    return null;
  }

  return { targetId, duration };
}

function formatSnoozedUntil(date: Date): string {
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function registerInteractionHandlers(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isButton()) {
      return;
    }

    let prefix: "snooze" | "cardsnooze";
    if (interaction.customId.startsWith("snooze:")) {
      prefix = "snooze";
    } else if (interaction.customId.startsWith("cardsnooze:")) {
      prefix = "cardsnooze";
    } else {
      return;
    }

    const table = prefix === "snooze" ? "project_snooze" : "card_snooze";
    const column = prefix === "snooze" ? "project_id" : "card_id";
    const noun = prefix === "snooze" ? "project" : "card";

    const parsed = parseSnoozeCustomId(interaction.customId, prefix);
    if (!parsed) {
      await interaction
        .reply({ content: "This snooze button is malformed and can't be processed.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return;
    }

    const { targetId, duration } = parsed;

    // Acknowledge within Discord's 3s window before doing any DB work;
    // editReply below has no such deadline.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const userResult = await getPool().query(
        "SELECT id FROM user_account WHERE discord_user_id = $1",
        [interaction.user.id],
      );
      const plankaUserId = userResult.rows[0]?.id as string | undefined;

      if (!plankaUserId) {
        await interaction.editReply({
          content: "Link your Discord account in Planka settings first.",
        });
        return;
      }

      const snoozedUntil = new Date(Date.now() + DURATION_MS[duration]);

      await getPool().query(
        `INSERT INTO ${table} (${column}, user_id, snoozed_until, created_at, updated_at)
         VALUES ($1, $2, $3, now(), now())
         ON CONFLICT (${column}, user_id)
         DO UPDATE SET snoozed_until = excluded.snoozed_until, updated_at = now()`,
        [targetId, plankaUserId, snoozedUntil],
      );

      await interaction.editReply({
        content: `Snoozed until ${formatSnoozedUntil(snoozedUntil)}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[interactions] failed to handle snooze click for ${noun} ${targetId}: ${message}`,
      );

      await interaction
        .editReply({ content: `Couldn't snooze this ${noun} — it may have been deleted.` })
        .catch(() => {});
    }
  });
}
