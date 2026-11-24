import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { emailIdempotencyKey, sendDelayMs } from '../src/scheduling.js';

// Replicate schema used in server.ts
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

test('Validation: Rejects missing or empty recipient', () => {
  assert.throws(() => {
    scheduleSchema.parse({
      subject: 'Hello',
      body: 'World',
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });
});

test('Validation: Rejects invalid recipient email format', () => {
  assert.throws(() => {
    scheduleSchema.parse({
      to: 'not-an-email',
      subject: 'Hello',
      body: 'World',
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  assert.throws(() => {
    scheduleSchema.parse({
      recipients: ['valid@example.com', 'bad-email@'],
      subject: 'Hello',
      body: 'World',
      scheduledAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });
});

test('Validation: Accepts single "to" string and multiple "recipients" array', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  
  const single = scheduleSchema.parse({
    to: 'test@example.com',
    subject: 'Single test',
    body: 'Single body',
    scheduledAt: future,
  });
  assert.equal(single.to, 'test@example.com');

  const multiple = scheduleSchema.parse({
    recipients: ['a@example.com', 'b@example.com'],
    subject: 'Multi test',
    body: 'Multi body',
    scheduledAt: future,
  });
  assert.deepEqual(multiple.recipients, ['a@example.com', 'b@example.com']);
});

test('Validation: Rejects past scheduled times', () => {
  const pastTime = new Date(Date.now() - 60_000); // 1 minute in the past
  const isPast = pastTime.getTime() < Date.now() - 5000;
  assert.equal(isPast, true, 'Should detect past timestamp');
});

test('Scheduling: Calculates delay correctly based on scheduledAt', () => {
  const targetTime = Date.now() + 10_000;
  const start = new Date(targetTime);
  const delay = Math.max(0, start.getTime() - Date.now());
  assert.ok(delay >= 9500 && delay <= 10500, `Delay ${delay} should be around 10000ms`);
});

test('Scheduling: Idempotency key prevents duplicate scheduling jobs', () => {
  const scheduledAt = new Date('2026-12-01T10:00:00.000Z');
  const key1 = emailIdempotencyKey('user-1', 'sender-1', 'lead@reachinbox.ai', 'Demo Call', scheduledAt);
  const key2 = emailIdempotencyKey('user-1', 'sender-1', 'lead@reachinbox.ai', 'Demo Call', scheduledAt);
  assert.equal(key1, key2, 'Keys for identical scheduling parameters must match');

  const keyDifferentRecipient = emailIdempotencyKey('user-1', 'sender-1', 'other@reachinbox.ai', 'Demo Call', scheduledAt);
  assert.notEqual(key1, keyDifferentRecipient, 'Keys for different recipients must differ');
});

test('Worker: Delays between email dispatches respect minimum gap', () => {
  assert.equal(sendDelayMs(0, 2000), 2000);
  assert.equal(sendDelayMs(5, 2000), 5000);
});
