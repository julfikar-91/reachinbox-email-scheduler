import 'dotenv/config';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@elastic/elasticsearch';

const enabled=process.env.RUN_ELASTICSEARCH_INTEGRATION==='1';
test('Elasticsearch indexes scheduled email documents and supports tenant/status search',{skip:!enabled},async()=>{
  const client=new Client({node:process.env.ELASTICSEARCH_URL||'http://127.0.0.1:9200'});const id=`integration-${Date.now()}`,userId=`tenant-${Date.now()}`;
  try{
    await client.index({index:'emails',id,refresh:'wait_for',document:{id,userId,recipient:'search-target@example.test',subject:'Queue integration marker',body:'searchable body content',sender:'sender@example.test',status:'SCHEDULED',scheduledAt:new Date()}});
    const result=await client.search({index:'emails',query:{bool:{must:[{multi_match:{query:'Queue integration marker',fields:['recipient','subject','body','sender']}}],filter:[{term:{'userId.keyword':userId}},{terms:{'status.keyword':['SCHEDULED','SENDING']}}]}},size:5});
    assert.equal(typeof result.hits.total==='number'?result.hits.total:result.hits.total?.value,1);
    const denied=await client.search({index:'emails',query:{term:{'userId.keyword':'another-tenant'}},size:5});assert.equal(typeof denied.hits.total==='number'?denied.hits.total:denied.hits.total?.value,0);
  }finally{await client.delete({index:'emails',id,refresh:'wait_for'}).catch(()=>{});await client.close()}
});
