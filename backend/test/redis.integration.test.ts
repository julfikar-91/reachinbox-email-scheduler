import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import IORedis from 'ioredis';
import {Queue,Worker} from 'bullmq';
import {senderReservationScript} from '../src/rate-limit.js';

const enabled=process.env.RUN_REDIS_INTEGRATION==='1';
const connectionOptions={host:process.env.REDIS_HOST||'localhost',port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD||undefined,maxRetriesPerRequest:null as null};

test('Redis Lua reservations enforce hourly cap and sender-wide send spacing atomically',{skip:!enabled},async()=>{
  const redis=new IORedis(connectionOptions);const suffix=`test:${Date.now()}:${Math.random()}`;const now=Date.now();
  try{
    const call=(id:string)=>redis.eval(senderReservationScript,3,`${suffix}:hour`,`${suffix}:last`,`${suffix}:reservation:${id}`,String(now),String(2000),String(2),String(3600)) as Promise<number[]>;
    const [first,second,third]=await Promise.all([call('a'),call('b'),call('c')]);
    const results=[first,second,third];
    assert.equal(results.filter(result=>Number(result[0])===1).length,2);
    assert.equal(results.filter(result=>Number(result[0])===0).length,1);
    const dispatches=results.filter(result=>Number(result[0])===1).map(result=>Number(result[1])).sort((a,b)=>a-b);
    assert.ok(dispatches[1]-dispatches[0]>=2000);
  }finally{await redis.del(`${suffix}:hour`,`${suffix}:last`);await redis.quit()}
});

test('BullMQ delayed jobs are retained and processed after a client/worker restart',{skip:!enabled},async()=>{
  const queueName=`restart-test-${Date.now()}`;const producerRedis=new IORedis(connectionOptions);const queue=new Queue(queueName,{connection:producerRedis});
  await queue.add('restart-check',{id:'persisted'},{jobId:'restart-check',delay:500});await queue.close();await producerRedis.quit();
  const consumerRedis=new IORedis(connectionOptions);const worker=new Worker(queueName,async job=>job.data.id,{connection:consumerRedis});
  try{const result=await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Delayed job did not complete within 15 seconds')),15000);worker.on('completed',job=>{clearTimeout(timer);resolve(String(job.returnvalue))});worker.on('error',reject)});assert.equal(result,'persisted')}
  finally{await worker.close();await consumerRedis.quit();const cleanupRedis=new IORedis(connectionOptions);const cleanup=new Queue(queueName,{connection:cleanupRedis});await cleanup.obliterate({force:true});await cleanup.close();await cleanupRedis.quit()}
});

test('two worker processes can consume jobs from the same Redis queue',{skip:!enabled},async()=>{
  const queueName=`multi-worker-test-${Date.now()}`;const producerConnection=new IORedis(connectionOptions);const queue=new Queue(queueName,{connection:producerConnection});
  const connectionA=new IORedis(connectionOptions),connectionB=new IORedis(connectionOptions);let active=0,maxActive=0;const processor=async(job:any)=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,50));active--;return job.data.value};
  const workerA=new Worker(queueName,processor,{connection:connectionA,concurrency:1});const workerB=new Worker(queueName,processor,{connection:connectionB,concurrency:1});
  try{
    await Promise.all([workerA.waitUntilReady(),workerB.waitUntilReady()]);
    const values:number[]=[];const finished=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Workers did not finish all jobs within 15 seconds')),15000);const onDone=(job:any)=>{values.push(job.returnvalue);if(values.length===4){clearTimeout(timer);resolve()}};workerA.on('completed',onDone);workerB.on('completed',onDone);workerA.on('error',reject);workerB.on('error',reject)});
    for(let i=0;i<4;i++)await queue.add('parallel',{value:i});await finished;
    assert.deepEqual(values.sort((a,b)=>a-b),[0,1,2,3]);assert.ok(maxActive>=2,'both workers should have processed concurrently');
  }finally{await Promise.all([workerA.close(),workerB.close(),queue.close()]);await Promise.all([connectionA.quit(),connectionB.quit(),producerConnection.quit()]);const cleanupRedis=new IORedis(connectionOptions);const cleanup=new Queue(queueName,{connection:cleanupRedis});await cleanup.obliterate({force:true});await cleanup.close();await cleanupRedis.quit()}
});
