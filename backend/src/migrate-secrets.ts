import {prisma} from './store.js';
import {encryptSmtpConfiguration} from './security.js';

async function main(){
  let migrated=0;
  const senders=await prisma.sender.findMany({select:{id:true,smtpConfiguration:true}});
  for(const sender of senders){
    const config=sender.smtpConfiguration as Record<string,unknown>;
    if(typeof config.encryptedCredentials==='string')continue;
    if(typeof config.host!=='string'||typeof config.user!=='string'||typeof config.pass!=='string'){
      console.error(`Sender ${sender.id} has an unsupported SMTP configuration; left unchanged.`);continue;
    }
    await prisma.sender.update({where:{id:sender.id},data:{smtpConfiguration:encryptSmtpConfiguration({host:config.host,port:Number(config.port||587),secure:config.secure===true,user:config.user,pass:config.pass})}});
    migrated++;
  }
  console.log(`Encrypted SMTP credentials for ${migrated} sender(s).`);
}
main().catch(error=>{console.error('SMTP credential migration failed',error);process.exitCode=1}).finally(()=>prisma.$disconnect());
