import 'dotenv/config';
import nodemailer from 'nodemailer';
import { Worker, type Job } from 'bullmq';
import { prisma, redis, es, emailQueue } from './store.js';
import { cfg } from './config.js';
import { decryptSmtpConfiguration } from './security.js';
import { senderReservationScript } from './rate-limit.js';

// ── Elasticsearch indexing helper ─────────────────────────────────────────────
async function indexEmail(email: any): Promise<boolean> {
  try {
    await es.index({
      index: 'emails',
      id: email.id,
      document: {
        id: email.id,
        userId: email.userId,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        sender: email.sender?.email || '',
        status: email.status,
        scheduledAt: email.scheduledAt,
        sentAt: email.sentAt,
      },
    });
    await prisma.email.update({
      where: { id: email.id },
      data: { indexedAt: new Date() },
    });
    return true;
  } catch (e) {
    console.error(
      'Elasticsearch indexing failed; PostgreSQL outbox will retry on worker restart',
      e,
    );
    return false;
  }
}

// ── Slack hourly-cap alert (deduplicated per sender per hour) ─────────────────
async function slackAlert(userId: string, sender: string, count: number) {
  const key = `slack-alert:${userId}:${sender}:${Math.floor(Date.now() / 3_600_000)}`;
  try {
    const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
    if (!integration?.slackUserId) return;

    const { decrypt } = await import('./security.js');
    const token = decrypt(integration.encryptedAccessToken);

    // Atomic deduplication: only the first worker to set the key sends the alert
    if (!(await redis.set(key, 'sending', 'EX', 3600, 'NX'))) return;

    const r: any = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        channel: integration.slackUserId,
        text: `ReachInbox alert: hourly sending limit reached for ${sender}. ${count} emails were processed; the remaining emails are rescheduled to the next hourly window.`,
      }),
    }).then((x) => x.json());

    if (!r.ok) {
      await redis.del(key);
      throw new Error(r.error);
    }
    // Mark as sent so the key expiry is reset to 1 h from now
    await redis.set(key, 'sent', 'EX', 3600);
  } catch (e) {
    console.error('Slack notification failed; a later limit check may retry', e);
  }
}

// ── Email delivery handler ────────────────────────────────────────────────────
async function handleEmail(job: Job) {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { sender: true, user: true },
  });

  // Skip if already in a terminal or in-flight state
  if (!email || email.status === 'SENT' || email.status === 'CANCELLED') return;
  if (email.status === 'PROCESSING' || email.status === 'SENDING') return;

  const sender = email.sender;
  if (!sender) {
    await prisma.email.update({
      where: { id: email.id },
      data: { status: 'FAILED', errorMessage: 'No sender is configured' },
    });
    return;
  }

  // ── Atomic Redis rate-limit reservation ──────────────────────────────────
  const now = Date.now();
  const windowSeconds = 3600;
  const limit = sender.hourlyLimit || cfg.hourlyLimit;

  const reservation = (await redis.eval(
    senderReservationScript,
    3,
    `sender:${sender.id}:hour:${Math.floor(now / 3_600_000)}`,
    `sender:${sender.id}:last-send`,
    `sender:${sender.id}:reservation:${email.id}`,
    String(now),
    String(Math.max(Number(job.data.delayMs) || 0, cfg.delay)),
    String(limit),
    String(windowSeconds),
  )) as number[];

  if (Number(reservation[0]) === 0) {
    // Rate cap exceeded – requeue for the next hourly window
    const due = Number(reservation[1]) + 500;
    await emailQueue.add('send', job.data, {
      jobId: `${email.id}-defer-${Math.floor(due / 1000)}`,
      delay: Math.max(1000, due - Date.now()),
    });
    if (Number(reservation[2]) === limit) {
      await slackAlert(email.userId, sender.email, limit);
    }
    return;
  }

  const dispatchAt = Number(reservation[1]);
  if (dispatchAt > Date.now()) {
    // Throttle delay still pending – requeue precisely
    await emailQueue.add('send', job.data, {
      jobId: `${email.id}-throttle-${dispatchAt}`,
      delay: dispatchAt - Date.now(),
    });
    return;
  }

  // ── Conditional SCHEDULED → PROCESSING claim (prevents duplicate delivery) ──
  const claim = await prisma.email.updateMany({
    where: { id: email.id, status: 'SCHEDULED' },
    data: { status: 'PROCESSING', errorMessage: null },
  });
  if (!claim.count) return; // Another worker claimed it

  try {
    let sc: any;
    try {
      sc = decryptSmtpConfiguration(
        sender.smtpConfiguration as Record<string, unknown>,
      );
    } catch (configErr) {
      console.warn(`Could not decrypt sender ${sender.id} configuration, generating Ethereal test account:`, configErr);
      const testAccount = await nodemailer.createTestAccount();
      sc = {
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        user: testAccount.user,
        pass: testAccount.pass,
      };
    }

    const transporter = nodemailer.createTransport({
      host: sc.host,
      port: sc.port,
      secure: sc.secure,
      auth: { user: sc.user, pass: sc.pass },
    });
    const info = await transporter.sendMail({
      from: sender.email,
      to: email.to || email.recipient,
      subject: email.subject,
      text: email.body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;

    const sent = await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        previewUrl: previewUrl ? String(previewUrl) : null,
        errorMessage: null,
      },
      include: { sender: true },
    });
    await indexEmail(sent);
    console.log(
      `Delivered ${email.id} to ${email.to || email.recipient}; preview: ${
        previewUrl || 'SMTP provider did not return preview URL'
      }`,
    );
  } catch (error: any) {
    const attempts = job.opts.attempts || 3;
    const isFinal = job.attemptsMade + 1 >= attempts;
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: isFinal ? 'FAILED' : 'SCHEDULED',
        errorMessage: error.message || 'SMTP delivery failed',
      },
    });
    if (isFinal) {
      const failed = await prisma.email.findUnique({
        where: { id: email.id },
        include: { sender: true },
      });
      if (failed) await indexEmail(failed);
      return;
    }
    throw error; // rethrow so BullMQ retries with exponential back-off
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

worker.on('error', (error) => console.error('BullMQ worker error:', error));
worker.on('completed', (j) => console.log(`Job ${j.id} completed`));
worker.on('failed', (j, e) => console.error(`Job ${j?.id} failed`, e));

console.log(`Email worker started (concurrency ${cfg.concurrency})`);

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  await redis.quit();
  globalThis.process.exit(0);
};
globalThis.process.once('SIGINT', shutdown);
globalThis.process.once('SIGTERM', shutdown);
