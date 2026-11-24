import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

test('Ethereal SMTP accepts a message and returns a valid preview URL', async (t) => {
  let user = process.env.ETHEREAL_USER;
  let pass = process.env.ETHEREAL_PASS;
  let host = process.env.ETHEREAL_HOST || 'smtp.ethereal.email';
  let port = Number(process.env.ETHEREAL_PORT || 587);
  const recipient = process.env.ETHEREAL_TEST_RECIPIENT || 'test-recipient@ethereal.email';

  try {
    if (!user || !pass) {
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: user,
      to: recipient,
      subject: 'ReachInbox Ethereal Integration Test',
      text: 'Test message verifying Ethereal email delivery and preview URL generation.',
    });

    assert.ok(info.messageId, 'SMTP response should include a messageId');
    const previewUrl = nodemailer.getTestMessageUrl(info);
    assert.ok(previewUrl, 'Ethereal should return a preview URL');
    assert.ok(String(previewUrl).startsWith('https://ethereal.email/message/'), 'Preview URL should be an ethereal.email link');
    await transporter.close();
  } catch (err: any) {
    if (
      err?.code === 'EFETCH' ||
      err?.code === 'ENOTFOUND' ||
      err?.code === 'EDNS' ||
      err?.code === 'ETIMEDOUT' ||
      err?.message?.includes('ENOTFOUND') ||
      err?.message?.includes('DNS lookup') ||
      err?.message?.includes('timed out')
    ) {
      t.skip('Network connection to Ethereal API unavailable in this environment');
      return;
    }
    throw err;
  }
});
