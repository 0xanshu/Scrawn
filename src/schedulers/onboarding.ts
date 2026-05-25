import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { DateTime } from "luxon";
import { logger } from "../errors/logger";
import { getMetadata, tryClaimWebhookFire } from "../storage/db/postgres/helpers/metadata";
import { getPostgresDB } from "../storage/db/postgres/db";

export class OnboardingScheduler {
  private tasks: ScheduledTask[] = [];

  async start(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.stop();

    const metadata = await getMetadata();

    if (!metadata) {
      return;
    }

    const expressions = metadata.payment_cron
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    for (const expr of expressions) {
      if (!cron.validate(expr)) {
        logger.lifecycleWarning(`[scheduler] Invalid cron expression: ${expr}`);
        continue;
      }

      const task = cron.schedule(expr, () => {
        this.fireWebhook(metadata.id).catch((e) => {
          const err = e instanceof Error ? e : new Error(String(e));
          logger.fatal(`[scheduler] Unhandled error: ${err.message}`, err);
        });
      });

      this.tasks.push(task);
    }
  }

  private async fireWebhook(metadataId: string): Promise<void> {
    const db = getPostgresDB();

    const webhookUrl = await db.transaction(async (txn) => {
      return tryClaimWebhookFire(txn, metadataId);
    });

    if (!webhookUrl) {
      return;
    }

    const timestamp = DateTime.utc().toISO();

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timestamp }),
      });

      if (!response.ok) {
        logger.fatal(
          `[scheduler] Webhook failed: ${response.status} ${response.statusText}`
        );
        return;
      }

      logger.lifecycle(`[scheduler] Webhook triggered at ${timestamp}`);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      logger.fatal(`[scheduler] Webhook error: ${err.message}`, err);
    }
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }
}

let instance: OnboardingScheduler | null = null;

export function initScheduler(): OnboardingScheduler {
  instance = new OnboardingScheduler();
  return instance;
}

export async function reloadScheduler(): Promise<void> {
  if (instance) {
    await instance.reload();
  }
}
