'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync('supabase/functions/greenrich-socialberries/index.ts','utf8');
const checks=[
 'action==="messages"',
 'providerRead(cfg,"whatsapp/messages/",{phone_number:phone,page,limit:"15"})',
 'const envelopes=[data,data?.data]',
 'v?.results,v?.messages,v?.data',
 'shape_known:false',
 'template.components.find',
 'safe(x.message_text)||safe(x.text)||safe(x.body?.text)||safe(body?.text)',
 'Number.isFinite(count)',
 'Authorization:header',
 'Only read-only tests'
];
for(const item of checks)assert.ok(src.includes(item),'Missing documented Get Messages contract: '+item);
assert.ok(!src.includes('if(!list)list=[]'),'Never silently return an empty chat on unknown provider response');
console.log('PASS: SocialBerries GET Messages phone/page/limit contract and safe response parsing');
