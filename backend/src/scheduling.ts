import {createHash} from 'node:crypto';

export function emailIdempotencyKey(userId:string,senderId:string,recipient:string,subject:string,scheduledAt:Date){
  return createHash('sha256').update([userId,senderId,recipient.trim().toLowerCase(),subject,scheduledAt.toISOString()].join('\0')).digest('hex');
}

export function sendDelayMs(requestedSeconds:number|undefined,minimumMs:number){
  return Math.max(minimumMs,Math.max(0,requestedSeconds??minimumMs/1000)*1000);
}
