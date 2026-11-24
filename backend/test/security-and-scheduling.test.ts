import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('SMTP credentials are encrypted at rest and decrypt correctly',async()=>{
  const security=await import('../src/security.js');
  const secret={host:'smtp.example.test',port:587,user:'alice',pass:'not-a-real-password'};
  const stored=security.encryptSmtpConfiguration(secret);
  assert.equal(JSON.stringify(stored).includes(secret.pass),false);
  assert.deepEqual(security.decryptSmtpConfiguration(stored),{...secret,secure:false});
});

test('AES-GCM rejects modified ciphertext',async()=>{
  const security=await import('../src/security.js');
  const encrypted=security.encrypt('token');
  const [iv,tag,data]=encrypted.split('.');
  const tamperedTag = tag.slice(0, -1) + (tag.slice(-1) === '0' ? '1' : '0');
  assert.throws(()=>security.decrypt(`${iv}.${tamperedTag}.${data}`));
});

test('SMTP config decoder can read legacy records for the migration command',async()=>{
  const security=await import('../src/security.js');
  assert.deepEqual(security.decryptSmtpConfiguration({host:'smtp.test',port:465,user:'u',pass:'p'}),{host:'smtp.test',port:465,secure:true,user:'u',pass:'p'});
});

test('schedule idempotency key is stable and tenant/recipient scoped',async()=>{
  const {emailIdempotencyKey}=await import('../src/scheduling.js');
  const when=new Date('2026-12-01T09:00:00.000Z');
  const a=emailIdempotencyKey('user-a','sender-a',' Test@Example.com ','Hello',when);
  assert.equal(a,emailIdempotencyKey('user-a','sender-a','test@example.com','Hello',when));
  assert.notEqual(a,emailIdempotencyKey('user-b','sender-a','test@example.com','Hello',when));
  assert.notEqual(a,emailIdempotencyKey('user-a','sender-a','other@example.com','Hello',when));
});

test('worker delay never falls below the configured minimum',async()=>{
  const {sendDelayMs}=await import('../src/scheduling.js');
  assert.equal(sendDelayMs(0,2000),2000);
  assert.equal(sendDelayMs(5,2000),5000);
  assert.equal(sendDelayMs(undefined,2000),2000);
});
