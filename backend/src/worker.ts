import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { prisma, redis, emailQueue } from './store.js';
import { cfg } from './config.js';
import { processEmailDelivery, indexEmail, slackAlert } from './delivery.js';

export { processEmailDelivery };

// ── BullMQ Job handler ────────────────────────────────────────────────────────
async function handleEmail(job: Job) {
  const success = await processEmailDelivery(job.data.emailId, job.data.delayMs);
  if (!success) {
    const attempts = job.opts.attempts || 3;
    if (job.attemptsMade + 1 < attempts) {
      throw new Error('Email delivery retry requested');
    }
  }
}

// ── Worker instance ───────────────────────────────────────────────────────────
const worker = new Worker('emails', handleEmail, {
  connection: redis,
  concurrency: cfg.concurrency,
});

// ── Startup recovery ──────────────────────────────────────────────────────────
worker.on('ready', async () => {
  try {
    // 1. Mark stale in-flight records as FAILED (uncertain delivery outcome)
    const stale = await prisma.email.updateMany({
      where: {
        status: { in: ['PROCESSING', 'SENDING'] },
        updatedAt: { lt: new Date(Date.now() - 15 * 60_000) },
      },
      data: {
        status: 'FAILED',
        errorMessage:
          'Delivery outcome is uncertain after worker interruption; inspect Ethereal before retrying.',
      },
    });
    if (stale.count) {
      console.warn(`Marked ${stale.count} interrupted deliveries for manual review`);
    }

    // 2. Backfill Elasticsearch for any records missing indexedAt
    let indexedCount = 0;
    let indexCursor: string | undefined;
    while (true) {
      const batch = await prisma.email.findMany({
        where: {
          indexedAt: null,
          ...(indexCursor ? { id: { gt: indexCursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
        select: {
          id: true,
          userId: true,
          recipient: true,
          subject: true,
          body: true,
          status: true,
          scheduledAt: true,
          sentAt: true,
          sender: { select: { email: true } },
        },
      });
      if (!batch.length) break;
      for (const email of batch) if (await indexEmail(email)) indexedCount++;
      indexCursor = batch[batch.length - 1].id;
    }

    // 3. Re-enqueue any SCHEDULED records that lost their BullMQ jobs
    let recovered = 0;
    let cursor: string | undefined;
    while (true) {
      const batch = await prisma.email.findMany({
        where: {
          status: 'SCHEDULED',
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 500,
        select: { id: true, scheduledAt: true },
      });
      if (!batch.length) break;
      for (const email of batch) {
        await emailQueue.add(
          'send',
          { emailId: email.id, delayMs: cfg.delay },
          {
            jobId: email.id,
            delay: Math.max(0, email.scheduledAt.getTime() - Date.now()),
          },
        );
        recovered++;
      }
      cursor = batch[batch.length - 1].id;
    }

    console.log(
      `Repaired ${indexedCount} Elasticsearch documents; recovered ${recovered} scheduled rows into BullMQ`,
    );
  } catch (e) {
    console.error('Queue/index recovery pass failed', e);
  }
});

let loggedRedisDown = false;
worker.on('error', (error: any) => {
  if (error?.code === 'ECONNREFUSED') {
    if (!loggedRedisDown) {
      console.warn('BullMQ worker: Redis not running on 6379 — using DB fallback polling in API server.');
      loggedRedisDown = true;
    }
    return;
  }
  console.error('BullMQ worker error:', error);
});
worker.on('completed', (j) => console.log(`Job ${j.id} completed`));
worker.on('failed', (j, e) => console.error(`Job ${j?.id} failed`, e));

console.log(`Email worker started (concurrency ${cfg.concurrency})`);

// ── Resilient Scheduler Poller (Processes due emails from DB continuously) ───
let pollingBusy = false;
async function pollDueEmails() {
  if (pollingBusy) return;
  pollingBusy = true;
  try {
    const dueEmails = await prisma.email.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
      },
      select: { id: true, subject: true, scheduledAt: true },
      take: 10,
    });

    if (dueEmails.length > 0) {
      console.log(`[Scheduler] Found ${dueEmails.length} due email(s) ready to send:`, dueEmails.map(d => d.id));
      for (const item of dueEmails) {
        await processEmailDelivery(item.id);
      }
    }
  } catch (err: any) {
    console.error('[Scheduler Poller Error]:', err.message);
  } finally {
    pollingBusy = false;
  }
}

// Check every 3 seconds so due emails are dispatched without delay
setInterval(pollDueEmails, 3000);
pollDueEmails();

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  await redis.quit();
  globalThis.process.exit(0);
};
globalThis.process.once('SIGINT', shutdown);
globalThis.process.once('SIGTERM', shutdown);
