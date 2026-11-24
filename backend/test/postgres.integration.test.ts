import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import IORedis from 'ioredis';
import {Queue} from 'bullmq';
import {encryptSmtpConfiguration} from '../src/security.js';
import {emailIdempotencyKey} from '../src/scheduling.js';

const enabled=process.env.RUN_DB_INTEGRATION==='1';
const redisOptions={host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD||undefined,maxRetriesPerRequest:null as null};

test('PostgreSQL upsert prevents duplicate rows and cancellation removes delayed work',{skip:!enabled},async()=>{
  const prisma=new PrismaClient();const redis=new IORedis(redisOptions);const queueName=`email-integration-${Date.now()}`;const queue=new Queue(queueName,{connection:redis});
  const suffix=`${Date.now()}-${Math.random().toString(16).slice(2)}`;let userId:string|undefined;
  try{
    const user=await prisma.user.create({data:{googleId:`integration-${suffix}`,name:'Integration test',email:`integration-${suffix}@example.test`}});userId=user.id;
    const sender=await prisma.sender.create({data:{userId:user.id,email:`sender-${suffix}@example.test`,hourlyLimit:5,smtpConfiguration:encryptSmtpConfiguration({host:'smtp.ethereal.email',port:587,user:'unit',pass:'unit'})}});
    const scheduledAt=new Date(Date.now()+60*60_000);const idempotencyKey=emailIdempotencyKey(user.id,sender.id,'recipient@example.test','Test',scheduledAt);
    const createData={userId:user.id,senderId:sender.id,recipient:'recipient@example.test',subject:'Test',body:'Not sent by this integration test',scheduledAt,idempotencyKey};
    const [first,second]=await Promise.all([prisma.email.upsert({where:{idempotencyKey},create:createData,update:{}}),prisma.email.upsert({where:{idempotencyKey},create:createData,update:{}})]);
    assert.equal(first.id,second.id);
    await queue.add('send',{emailId:first.id},{jobId:first.id,delay:60*60_000});
    await queue.remove(first.id);
    await prisma.email.update({where:{id:first.id},data:{status:'CANCELLED'}});
    assert.equal(await prisma.email.count({where:{idempotencyKey}}),1);
    assert.equal((await prisma.email.findUniqueOrThrow({where:{id:first.id}})).status,'CANCELLED');
    assert.equal(await queue.getJob(first.id),undefined);
  }finally{
    await queue.close();await redis.quit();
    if(userId)await prisma.user.delete({where:{id:userId}});
    await prisma.$disconnect();
  }
});
