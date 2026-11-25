import nodemailer from 'nodemailer';
import { prisma, redis, es, emailQueue } from './store.js';
import { cfg } from './config.js';
import { decryptSmtpConfiguration } from './security.js';
import { senderReservationScript } from './rate-limit.js';

// ── Elasticsearch indexing helper ─────────────────────────────────────────────
export async function indexEmail(email: any): Promise<boolean> {
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
  } catch {
    return false;
  }
}

// ── Slack hourly-cap alert (deduplicated per sender per hour) ─────────────────
export async function slackAlert(userId: string, sender: string, count: number) {
  const key = `slack-alert:${userId}:${sender}:${Math.floor(Date.now() / 3_600_000)}`;
  try {
    const integration = await prisma.slackIntegration.findUnique({ where: { userId } });
    if (!integration?.slackUserId) return;

    const { decrypt } = await import('./security.js');
    const token = decrypt(integration.encryptedAccessToken);

    if (redis.status === 'ready') {
      if (!(await redis.set(key, 'sending', 'EX', 3600, 'NX'))) return;
    }

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
      if (redis.status === 'ready') await redis.del(key);
      throw new Error(r.error);
    }
    if (redis.status === 'ready') await redis.set(key, 'sent', 'EX', 3600);
  } catch (e) {
    console.error('Slack notification failed:', e);
  }
}

// ── Standalone / Reusable Email delivery handler ─────────────────────────────
export async function processEmailDelivery(
  emailId: string,
  delayMs = 0,
): Promise<boolean> {
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true, user: true },
  });

  // Skip if already in a terminal or in-flight state
  if (!email || email.status === 'SENT' || email.status === 'CANCELLED') return false;
  if (email.status === 'PROCESSING' || email.status === 'SENDING') return false;

  const sender = email.sender;
  if (!sender) {
    await prisma.email.update({
      where: { id: email.id },
      data: { status: 'FAILED', errorMessage: 'No sender is configured' },
    });
    return false;
  }

  // ── Atomic Redis rate-limit reservation (if Redis is active) ───────────────
  if (redis.status === 'ready') {
    try {
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
        String(Math.max(Number(delayMs) || 0, cfg.delay)),
        String(limit),
        String(windowSeconds),
      )) as number[];

      if (Number(reservation[0]) === 0) {
        const due = Number(reservation[1]) + 500;
        await emailQueue.add('send', { emailId: email.id, delayMs }, {
          jobId: `${email.id}-defer-${Math.floor(due / 1000)}`,
          delay: Math.max(1000, due - Date.now()),
        });
        if (Number(reservation[2]) === limit) {
          await slackAlert(email.userId, sender.email, limit);
        }
        return false;
      }

      const dispatchAt = Number(reservation[1]);
      if (dispatchAt > Date.now()) {
        await emailQueue.add('send', { emailId: email.id, delayMs }, {
          jobId: `${email.id}-throttle-${dispatchAt}`,
          delay: dispatchAt - Date.now(),
        });
        return false;
      }
    } catch {
      // Redis check skipped
    }
  }

  // ── Conditional SCHEDULED → PROCESSING claim (prevents duplicate delivery) ──
  const claim = await prisma.email.updateMany({
    where: { id: email.id, status: 'SCHEDULED' },
    data: { status: 'PROCESSING', errorMessage: null },
  });
  if (!claim.count) return false;

  try {
    let sc: any;
    try {
      sc = decryptSmtpConfiguration(
        sender.smtpConfiguration as Record<string, unknown>,
      );
    } catch {
      sc = {
        host: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
        port: Number(process.env.ETHEREAL_PORT) || 587,
        secure: false,
        user: process.env.ETHEREAL_USER || 'k777uo3ps25cesas@ethereal.email',
        pass: process.env.ETHEREAL_PASS || 'dbekegxs6RvuEDMk5e',
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
      `[SMTP Confirmed] Delivered ${email.id} to ${email.to || email.recipient}; preview: ${
        previewUrl || 'SMTP provider did not return preview URL'
      }`,
    );
    return true;
  } catch (error: any) {
    console.error(`[SMTP Error] Delivery failed for ${email.id}:`, error.message);
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message || 'SMTP delivery failed',
      },
    });
    return false;
  }
}
