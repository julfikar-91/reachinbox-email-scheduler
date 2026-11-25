import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { prisma, emailQueue, redis, es } from './store.js';
import { cfg } from './config.js';
import {
  encrypt,
  encryptSmtpConfiguration,
  decryptSmtpConfiguration,
  publicSender,
} from './security.js';
import { emailIdempotencyKey, sendDelayMs } from './scheduling.js';
import { processEmailDelivery } from './delivery.js';

// ── Type augmentations ────────────────────────────────────────────────────────
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    oauthState?: string;
  }
}

// Express 5 types allow array-valued params; these routes accept one path ID.
function routeId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? (id[0] ?? '') : id;
}

// ── Startup guards ────────────────────────────────────────────────────────────
if (!process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET is required. Set it in the local .env file before starting the API.',
  );
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: false, // disabled so Bull Board static assets load in dev
  }),
);

// CORS – allow requests from configured frontend and local development ports
const allowedOrigins = [
  cfg.frontend,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

// Block non-GET mutations from unexpected origins
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    req.headers.origin &&
    !allowedOrigins.includes(req.headers.origin) &&
    !req.headers.origin.startsWith('http://localhost:') &&
    !req.headers.origin.startsWith('http://127.0.0.1:')
  ) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
});

app.use(express.json({ limit: '2mb' }));

// ── Sessions (Redis-backed with MemoryStore fallback) ─────────────────────────
const memoryStore = new session.MemoryStore();
const redisStore = new RedisStore({ client: redis, disableTouch: true });
const activeSessionStore: session.Store = Object.assign(
  Object.create(session.Store.prototype),
  {
    get: (sid: string, cb: any) =>
      redis.status === 'ready' ? redisStore.get(sid, cb) : memoryStore.get(sid, cb),
    set: (sid: string, sess: any, cb: any) =>
      redis.status === 'ready' ? redisStore.set(sid, sess, cb) : memoryStore.set(sid, sess, cb),
    destroy: (sid: string, cb: any) =>
      redis.status === 'ready' ? redisStore.destroy(sid, cb) : memoryStore.destroy(sid, cb),
    touch: (sid: string, sess: any, cb: any) =>
      redis.status === 'ready' && typeof (redisStore as any).touch === 'function'
        ? (redisStore as any).touch(sid, sess, cb)
        : memoryStore.touch
          ? memoryStore.touch(sid, sess, cb)
          : cb && cb(),
  },
);

app.use(
  session({
    store: activeSessionStore,
    name: 'reachinbox.sid',
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 86_400_000, // 7 days
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

// ── Passport serialisation ────────────────────────────────────────────────────
passport.serializeUser((u: any, done) => done(null, u.id));
passport.deserializeUser(async (id: string, done) => {
  try {
    done(null, await prisma.user.findUnique({ where: { id } }));
  } catch (e) {
    done(e);
  }
});

// ── Global API rate limiter ───────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ── Async route wrapper (Express 4 doesn't forward rejected promises) ─────────
for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
  const register = (app as any)[method].bind(app);
  (app as any)[method] = (path: any, ...handlers: any[]) =>
    register(
      path,
      ...handlers.map(
        (handler: any) => (req: any, res: any, next: any) => {
          try {
            Promise.resolve(handler(req, res, next)).catch(next);
          } catch (error) {
            next(error);
          }
        },
      ),
    );
}

// ── Google OAuth strategy ─────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL ||
          `${cfg.backend}/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const g = profile._json as any;
          const email = g.email || `${profile.id}@gmail.com`;
          let user = await prisma.user.findFirst({
            where: {
              OR: [{ googleId: profile.id }, { email }],
            },
          });
          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                googleId: profile.id,
                name: profile.displayName || user.name,
                email,
                avatar: profile.photos?.[0]?.value || user.avatar,
              },
            });
          } else {
            user = await prisma.user.create({
              data: {
                googleId: profile.id,
                name: profile.displayName || 'Google User',
                email,
                avatar: profile.photos?.[0]?.value || null,
              },
            });
          }
          done(null, user);
        } catch (e) {
          done(e as Error);
        }
      },
    ),
  );
}

// Helper to standardize email objects in API responses
function formatEmail(e: any) {
  if (!e) return null;
  return {
    id: e.id,
    userId: e.userId,
    senderId: e.senderId,
    to: e.to || e.recipient,
    recipient: e.recipient || e.to,
    subject: e.subject,
    body: e.body,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    status: e.status,
    idempotencyKey: e.idempotencyKey,
    errorMessage: e.errorMessage,
    previewUrl: e.previewUrl || null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    sender: e.sender ? { id: e.sender.id, email: e.sender.email } : undefined,
  };
}

// ── Auth middleware ───────────────────────────────────────────────────────────
const auth = async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);

  if (!userId) {
    return res.status(401).json({ error: 'Sign in required' });
  }

  (req as any).userId = userId;
  next();
};

// ── Auth routes ───────────────────────────────────────────────────────────────
app.get('/auth/google', (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res
      .status(503)
      .send(
        'Google OAuth is not configured. Set both client ID and client secret in .env.',
      );
  }
  passport.authenticate('google', { scope: ['profile', 'email'], state: true } as any)(
    req,
    res,
    next,
  );
});

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${cfg.frontend}/?auth=failed`,
    session: false,
  }),
  (req: Request, res: Response, next: NextFunction) => {
    (req as any).session.regenerate((err: any) => {
      if (err) return next(err);
      (req as any).session.userId = (req as any).user.id;
      (req as any).session.save((saveErr: any) => {
        if (saveErr) return next(saveErr);
        res.redirect(cfg.frontend);
      });
    });
  },
);

app.post('/auth/logout', (req: Request, res: Response, next: NextFunction) => {
  res.clearCookie('reachinbox.sid', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  if (req.session) {
    req.session.destroy((err: any) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  } else {
    res.json({ ok: true });
  }
});

app.post('/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawEmail = String(req.body.email || '').trim().toLowerCase();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
      ? rawEmail
      : 'oliver.brown@domain.io';

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const namePart = email
        .split('@')[0]
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      user = await prisma.user.create({
        data: {
          googleId: `local-${email}-${Date.now()}`,
          name: namePart || 'Oliver Brown',
          email,
          avatar:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
        },
      });
    }

    (req as any).session.userId = user.id;
    (req as any).session.save((err: any) => {
      if (err) return next(err);
      res.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        },
      });
    });
  } catch (e) {
    next(e);
  }
});

app.get('/auth/me', async (req: Request, res: Response) => {
  const userId = (req as any).session?.userId || (req.headers['x-user-id'] as string);
  if (!userId) {
    return res.status(401).json({ user: null, error: 'Not authenticated' });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, avatar: true },
    });
    if (!user) {
      if ((req as any).session) {
        (req as any).session.destroy(() => {});
      }
      return res.status(401).json({ user: null, error: 'User not found' });
    }
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Database query failed' });
  }
});

// ── Email scheduling ──────────────────────────────────────────────────────────
const scheduleSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required').max(50_000),
  to: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  recipient: z.string().email().optional(),
  recipients: z.array(z.string().email()).optional(),
  scheduledAt: z.string().datetime({ message: 'Invalid scheduledAt format (must be ISO datetime)' }),
  delaySeconds: z.number().min(0).max(3600).optional(),
  hourlyLimit: z.number().int().min(1).max(10_000).optional(),
  senderId: z.string().optional(),
}).refine((data) => {
  return Boolean(
    data.recipient ||
    (Array.isArray(data.to) ? data.to.length > 0 : data.to) ||
    (Array.isArray(data.recipients) && data.recipients.length > 0)
  );
}, { message: 'At least one recipient email address is required (to, recipient, or recipients)' });

app.post(
  '/api/emails/schedule',
  auth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const v = scheduleSchema.parse(req.body);
      const userId: string = (req as any).userId || (req as any).session?.userId;

      // Aggregate and sanitize recipients
      const recipientList: string[] = [];
      if (typeof v.to === 'string') recipientList.push(v.to);
      else if (Array.isArray(v.to)) recipientList.push(...v.to);
      if (v.recipient) recipientList.push(v.recipient);
      if (Array.isArray(v.recipients)) recipientList.push(...v.recipients);

      const recipients = [...new Set(recipientList.map((x) => x.trim().toLowerCase()))];
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'At least one valid recipient is required' });
      }

      const start = new Date(v.scheduledAt);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduledAt format' });
      }

      // Reject past scheduling times (allow 5-second grace buffer for network transit)
      if (start.getTime() < Date.now() - 5000) {
        return res.status(400).json({
          error: 'Scheduled time must be in the future',
          scheduledAt: v.scheduledAt,
          currentTime: new Date().toISOString(),
        });
      }

      // Find or auto-create a sender
      let sender = v.senderId
        ? await prisma.sender.findFirst({ where: { id: v.senderId, userId, isActive: true } })
        : await prisma.sender.findFirst({ where: { userId, isActive: true } });

      if (!sender) {
        let etherealUser = process.env.ETHEREAL_USER;
        let etherealPass = process.env.ETHEREAL_PASS;
        let host = process.env.ETHEREAL_HOST || 'smtp.ethereal.email';
        let port = Number(process.env.ETHEREAL_PORT || 587);

        if (!etherealUser || !etherealPass) {
          try {
            console.log('Generating automated Ethereal test account...');
            const testAccount = await nodemailer.createTestAccount();
            etherealUser = testAccount.user;
            etherealPass = testAccount.pass;
            host = testAccount.smtp.host;
            port = testAccount.smtp.port;
            console.log(`Created Ethereal test account: ${etherealUser}`);
          } catch (err) {
            console.warn('Could not auto-generate Ethereal account, using default configuration:', err);
          }
        }

        const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
        sender = await prisma.sender.create({
          data: {
            userId,
            email: etherealUser || dbUser.email,
            smtpConfiguration: encryptSmtpConfiguration({
              host,
              port,
              user: etherealUser || 'test@ethereal.email',
              pass: etherealPass || 'testpass',
            }),
            hourlyLimit: v.hourlyLimit || cfg.hourlyLimit,
          },
        });
      }

      if (v.hourlyLimit && sender.hourlyLimit !== v.hourlyLimit) {
        sender = await prisma.sender.update({
          where: { id: sender.id },
          data: { hourlyLimit: v.hourlyLimit },
        });
      }

      const created = await prisma.$transaction(async (tx: any) => {
        const out = [];
        for (const recipient of recipients) {
          const idempKey = emailIdempotencyKey(userId, sender!.id, recipient, v.subject, start);
          const email = await tx.email.upsert({
            where: { idempotencyKey: idempKey },
            create: {
              userId,
              senderId: sender!.id,
              recipient,
              to: recipient,
              subject: v.subject,
              body: v.body,
              scheduledAt: start,
              idempotencyKey: idempKey,
              status: 'SCHEDULED',
            },
            update: {},
          });
          out.push(email);
        }
        return out;
      });

      // Enqueue delayed BullMQ jobs for newly-scheduled emails
      const delayMs = Math.max(0, start.getTime() - Date.now());
      try {
        await Promise.race([
          Promise.all(
            created
              .filter((e: any) => e.status === 'SCHEDULED')
              .map((e: any) =>
                emailQueue.add(
                  'send',
                  { emailId: e.id, delayMs: sendDelayMs(v.delaySeconds, cfg.delay) },
                  {
                    jobId: e.id,
                    delay: delayMs,
                    attempts: 3,
                    backoff: {
                      type: 'exponential',
                      delay: 5000,
                    },
                  },
                ),
              ),
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Redis queue timeout: job saved in DB and will process on worker start')), 1500),
          ),
        ]);
      } catch (queueErr: any) {
        console.warn('BullMQ enqueue note:', queueErr.message);
      }

      // Best-effort Elasticsearch indexing
      try {
        await es.bulk({
          operations: created.flatMap((e: any) => [
            { index: { _index: 'emails', _id: e.id } },
            {
              id: e.id,
              userId: e.userId,
              recipient: e.recipient,
              to: e.to || e.recipient,
              subject: e.subject,
              body: e.body,
              sender: sender!.email,
              status: e.status,
              scheduledAt: e.scheduledAt,
              sentAt: e.sentAt,
            },
          ]),
          refresh: false,
        });
        await prisma.email.updateMany({
          where: { id: { in: created.map((e: any) => e.id) } },
          data: { indexedAt: new Date() },
        });
      } catch {
        // Elasticsearch is optional/best-effort
      }

      // Never expose SMTP secrets in the response
      res.status(201).json({ count: created.length, items: created.map(formatEmail) });
    } catch (e) {
      next(e);
    }
  },
);

// ── Shared email list helper ──────────────────────────────────────────────────
async function list(
  req: Request,
  res: Response,
  status: string[],
  queryOverride?: string,
) {
  const userId = (req as any).userId || (req as any).session?.userId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const q = queryOverride ?? String(req.query.q || '').trim();
  const where: any = {
    userId,
    status: { in: status },
  };
  const requestedStatus = String(req.query.status || '').toUpperCase();
  if (requestedStatus) {
    if (requestedStatus === 'PROCESSING') {
      where.status = { in: ['PROCESSING', 'SENDING'] };
    } else if (status.includes(requestedStatus)) {
      where.status = requestedStatus;
    }
  }
  if (q) {
    where.OR = [
      { recipient: { contains: q, mode: 'insensitive' } },
      { to: { contains: q, mode: 'insensitive' } },
      { subject: { contains: q, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.email.findMany({
      where,
      include: { sender: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.email.count({ where }),
  ]);
  res.json({ items: items.map(formatEmail), total, page, limit });
}

// ── GET /api/emails (All emails) ──────────────────────────────────────────────
app.get('/api/emails', auth, (req: Request, res: Response) =>
  list(req, res, ['SCHEDULED', 'PROCESSING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED']),
);

// ── GET /api/emails/scheduled ─────────────────────────────────────────────────
app.get('/api/emails/scheduled', auth, (req: Request, res: Response) =>
  list(req, res, ['SCHEDULED', 'PROCESSING', 'SENDING']),
);

// ── GET /api/emails/sent ───────────────────────────────────────────────────────
app.get('/api/emails/sent', auth, (req: Request, res: Response) =>
  list(req, res, ['SENT', 'FAILED', 'CANCELLED']),
);

app.get(
  '/api/emails/search',
  auth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const text = String(req.query.q || '').trim();
      const scope = String(req.query.scope || '');
      const allowed =
        scope === '/sent'
          ? ['SENT', 'FAILED', 'CANCELLED']
          : ['SCHEDULED', 'PROCESSING', 'SENDING'];
      const requested = String(req.query.status || '').toUpperCase();
      const statuses = allowed.includes(requested) ? [requested] : allowed;

      if (!text) return list(req, res, statuses);

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

      try {
        const result = await es.search({
          index: 'emails',
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: text,
                    fields: ['recipient', 'to', 'subject', 'body', 'sender'],
                  },
                },
              ],
              filter: [
                { term: { 'userId.keyword': (req as any).userId || (req as any).session?.userId } },
                { terms: { 'status.keyword': statuses } },
              ],
            },
          },
          from: (page - 1) * limit,
          size: limit,
        });
        const total =
          typeof result.hits.total === 'number'
            ? result.hits.total
            : result.hits.total?.value || 0;
        res.json({
          items: result.hits.hits.map((h: any) => formatEmail(h._source)),
          total,
          page,
          limit,
        });
      } catch (error) {
        return list(req, res, statuses, text);
      }
    } catch (e) {
      next(e);
    }
  },
);

app.get('/api/emails/:id', auth, async (req: Request, res: Response) => {
  const userId = (req as any).userId || (req as any).session?.userId;
  const email = await prisma.email.findFirst({
    where: { id: routeId(req), userId },
    include: { sender: { select: { id: true, email: true } } },
  });
  if (!email) return res.status(404).json({ error: 'Email not found' });
  res.json(formatEmail(email));
});

// ── DELETE /api/emails/:id and POST /api/emails/:id/cancel ─────────────────────
async function cancelEmailHandler(req: Request, res: Response) {
  const userId = (req as any).userId || (req as any).session?.userId;
  const e = await prisma.email.findFirst({
    where: {
      id: routeId(req),
      userId,
      status: { in: ['SCHEDULED', 'PROCESSING', 'SENDING'] },
    },
  });
  if (!e) return res.status(404).json({ error: 'Scheduled email not found' });

  try {
    await Promise.race([
      emailQueue.remove(e.id),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Queue timeout')), 1000)),
    ]);
  } catch (err) {
    console.warn(`Could not remove job ${e.id} from queue:`, err);
  }

  const cancelled = await prisma.email.update({
    where: { id: e.id },
    data: { status: 'CANCELLED' },
    include: { sender: true },
  });

  try {
    await es.index({
      index: 'emails',
      id: cancelled.id,
      document: {
        id: cancelled.id,
        userId: cancelled.userId,
        recipient: cancelled.recipient,
        to: cancelled.to || cancelled.recipient,
        subject: cancelled.subject,
        body: cancelled.body,
        sender: (cancelled.sender as any)?.email || '',
        status: cancelled.status,
        scheduledAt: cancelled.scheduledAt,
        sentAt: cancelled.sentAt,
      },
    });
  } catch (error) {
    // Elasticsearch is optional/best-effort
  }

  res.json({ ok: true, message: 'Scheduled email cancelled successfully', item: formatEmail(cancelled) });
}

app.delete('/api/emails/:id', auth, cancelEmailHandler);
app.post('/api/emails/:id/cancel', auth, cancelEmailHandler);

// ── POST /api/emails/:id/send-now (Confirm & send immediately) ──────────────
app.post('/api/emails/:id/send-now', auth, async (req: Request, res: Response) => {
  const userId = (req as any).userId || (req as any).session?.userId;
  const id = routeId(req);
  const email = await prisma.email.findFirst({
    where: { id, userId },
  });
  if (!email) return res.status(404).json({ error: 'Email not found' });
  if (email.status === 'SENT') {
    return res.json({ ok: true, message: 'Email already sent', item: formatEmail(email) });
  }

  // Update scheduledAt to now
  await prisma.email.update({
    where: { id },
    data: { scheduledAt: new Date() },
  });

  // Process delivery immediately
  await processEmailDelivery(id);
  const updated = await prisma.email.findUnique({
    where: { id },
    include: { sender: { select: { id: true, email: true } } },
  });
  res.json({ ok: true, message: 'Email confirmed and sent successfully', item: updated ? formatEmail(updated) : null });
});

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get(
  '/api/dashboard/stats',
  auth,
  async (req: Request, res: Response) => {
    const userId: string = (req as any).userId || (req as any).session?.userId;
    const [scheduled, sent, failed, pending, cancelled] = await Promise.all([
      prisma.email.count({ where: { userId, status: 'SCHEDULED' } }),
      prisma.email.count({ where: { userId, status: 'SENT' } }),
      prisma.email.count({ where: { userId, status: 'FAILED' } }),
      prisma.email.count({ where: { userId, status: 'SENDING' } }),
      prisma.email.count({ where: { userId, status: 'CANCELLED' } }),
    ]);
    res.json({ scheduled, sent, failed, pending, cancelled });
  },
);

// ── Sender management ─────────────────────────────────────────────────────────
app.get('/api/senders', auth, async (req: Request, res: Response) => {
  const userId: string = (req as any).userId || (req as any).session?.userId;
  const senders = await prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  // Never expose SMTP credentials in the response
  res.json(senders.map(publicSender));
});

const senderSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  smtpConfiguration: z.object({
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65_535),
    user: z.string().min(1).max(500),
    pass: z.string().min(1).max(2000),
  }),
  hourlyLimit: z.number().int().min(1).max(10_000).optional(),
});

app.post(
  '/api/senders',
  auth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const v = senderSchema.parse(req.body);
      const userId: string = (req as any).userId || (req as any).session?.userId;
      const sender = await prisma.sender.create({
        data: {
          ...v,
          smtpConfiguration: encryptSmtpConfiguration(v.smtpConfiguration),
          userId,
          hourlyLimit: v.hourlyLimit || cfg.hourlyLimit,
        },
      });
      res.status(201).json(publicSender(sender));
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  '/api/senders/:id/test',
  auth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId: string = (req as any).userId || (req as any).session?.userId;
      const sender = await prisma.sender.findFirst({
        where: { id: routeId(req), userId },
      });
      if (!sender) return res.status(404).json({ error: 'Sender not found' });

      const sc = decryptSmtpConfiguration(
        sender.smtpConfiguration as Record<string, unknown>,
      );
      const transporter = nodemailer.createTransport({
        host: sc.host,
        port: sc.port,
        secure: sc.secure,
        auth: { user: sc.user, pass: sc.pass },
      });
      const info = await transporter.sendMail({
        from: sender.email,
        to: sender.email,
        subject: 'ReachInbox SMTP test',
        text: 'Your sender account is configured and ready to schedule email.',
      });
      res.json({
        ok: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info) || null,
      });
    } catch (e) {
      next(e);
    }
  },
);

app.put(
  '/api/senders/:id',
  auth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const v = senderSchema.partial().parse(req.body);
      const data: any = { ...v };
      if (v.smtpConfiguration) {
        data.smtpConfiguration = encryptSmtpConfiguration(v.smtpConfiguration);
      }
      const userId: string = (req as any).userId || (req as any).session?.userId;
      const out = await prisma.sender.updateMany({
        where: { id: routeId(req), userId },
        data,
      });
      res.json(out);
    } catch (e) {
      next(e);
    }
  },
);

app.delete('/api/senders/:id', auth, async (req: Request, res: Response) => {
  const userId: string = (req as any).userId || (req as any).session?.userId;
  await prisma.sender.deleteMany({
    where: { id: routeId(req), userId },
  });
  res.json({ ok: true });
});

// ── Slack OAuth ───────────────────────────────────────────────────────────────
app.get('/api/slack/connect', auth, (req: Request, res: Response) => {
  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
    return res
      .status(503)
      .send(
        'Slack OAuth is not configured. Set both client ID and client secret in .env.',
      );
  }
  const state = randomBytes(24).toString('hex');
  (req as any).session.oauthState = state;
  const u = new URL('https://slack.com/oauth/v2/authorize');
  u.searchParams.set('client_id', process.env.SLACK_CLIENT_ID);
  u.searchParams.set('scope', 'chat:write');
  u.searchParams.set('user_scope', 'chat:write');
  u.searchParams.set(
    'redirect_uri',
    process.env.SLACK_REDIRECT_URI || `${cfg.backend}/api/slack/callback`,
  );
  u.searchParams.set('state', state);
  res.redirect(u.toString());
});

app.get(
  '/api/slack/callback',
  auth,
  async (req: Request, res: Response) => {
    try {
      if (
        !req.query.code ||
        req.query.state !== (req as any).session.oauthState
      ) {
        return res.status(400).send('Invalid OAuth state');
      }
      delete (req as any).session.oauthState;

      const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(req.query.code),
          client_id: process.env.SLACK_CLIENT_ID || '',
          client_secret: process.env.SLACK_CLIENT_SECRET || '',
          redirect_uri:
            process.env.SLACK_REDIRECT_URI ||
            `${cfg.backend}/api/slack/callback`,
        }),
      });
      const token: any = await tokenRes.json();
      if (!token.ok) throw new Error('Slack OAuth failed: ' + (token.error || 'unknown error'));
      if (!token.authed_user?.access_token || !token.authed_user?.id) {
        throw new Error(
          'Slack user-scope chat:write must be enabled for direct message alerts',
        );
      }

      const userId: string = (req as any).userId || (req as any).session?.userId;
      await prisma.slackIntegration.upsert({
        where: { userId },
        create: {
          userId,
          encryptedAccessToken: encrypt(
            token.authed_user.access_token,
          ),
          teamId: token.team?.id,
          teamName: token.team?.name,
          slackUserId: token.authed_user.id,
        },
        update: {
          encryptedAccessToken: encrypt(
            token.authed_user.access_token,
          ),
          teamId: token.team?.id,
          teamName: token.team?.name,
          slackUserId: token.authed_user.id,
        },
      });
      res.redirect(`${cfg.frontend}/slack?connected=1`);
    } catch (e: any) {
      res.status(400).send(e.message);
    }
  },
);

app.get('/api/slack/status', auth, async (req: Request, res: Response) => {
  const userId: string = (req as any).userId || (req as any).session?.userId;
  const s = await prisma.slackIntegration.findUnique({
    where: { userId },
  });
  res.json({ connected: !!s, teamId: s?.teamId, teamName: s?.teamName });
});

app.post(
  '/api/slack/disconnect',
  auth,
  async (req: Request, res: Response) => {
    const userId: string = (req as any).userId || (req as any).session?.userId;
    await prisma.slackIntegration.deleteMany({
      where: { userId },
    });
    res.json({ ok: true });
  },
);

// ── Bull Board (protected) ────────────────────────────────────────────────────
const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: boardAdapter,
});
app.use('/admin/queues', auth, boardAdapter.getRouter());

// ── Health and readiness ──────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, boolean> = {
    redis: false,
    postgres: false,
    elasticsearch: false,
  };
  const bounded = (work: () => Promise<any>) =>
    Promise.race([
      work(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('dependency timeout')), 4000),
      ),
    ]);
  const results = await Promise.allSettled([
    bounded(() => redis.ping()),
    bounded(() => prisma.$queryRaw`SELECT 1`),
    bounded(() => es.ping()),
  ]);
  checks.redis =
    results[0].status === 'fulfilled' && (results[0] as any).value === 'PONG';
  checks.postgres = results[1].status === 'fulfilled';
  checks.elasticsearch = results[2].status === 'fulfilled';
  const ready = checks.redis && checks.postgres && checks.elasticsearch;
  res.status(ready ? 200 : 503).json({ ready, checks });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: err.flatten() });
  }
  res
    .status(500)
    .json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
    });
});

// ── Start server ──────────────────────────────────────────────────────────────
const httpServer = app.listen(cfg.port, () =>
  console.log(`ReachInbox API listening on port ${cfg.port}`),
);

const shutdown = async () => {
  httpServer.close();
  await emailQueue.close();
  await redis.quit();
  await prisma.$disconnect();
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
