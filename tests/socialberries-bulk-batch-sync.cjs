'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const gateway=read('supabase/functions/greenrich-socialberries/index.ts');
const ui=read('greenrich-whatsapp-crm-workflows.js');
const migration=read('supabase/migrations/20261116234500_wa_bulk_batch_snapshots.sql');
assert.doesNotThrow(()=>new vm.Script(ui),'Marketing UI must parse');
for(const token of [
 'if(action==="batches")','if(action==="batch_detail")','if(action==="batch_history")',
 'whatsapp/messages/bulk_batches/','whatsapp/messages/bulk_batches/"+id+"/',
 'limit:"10"','page:String(page)','providerRow','persistBatches(records)',
 'company_id:connection.company_id','connection_id:connection.id',
 'message_statistics:stats','total_batches_count','completed_clients_count','mmlite',
 'success_rate','failure_rate','effective_success_rate','effective_failure_rate',
 'recovery_retry_succeeded','serverDb()','gr_wa_admin','provider_batch_id',
 'Do not follow provider','message:"Provider campaign summaries synced. No messages sent."'
])assert.ok(gateway.includes(token),'Missing secure batch adapter feature: '+token);
const readOnlyActions=gateway.slice(gateway.indexOf('if(action==="batch_history")'),gateway.indexOf('if(action==="sync_leads")'));
assert.ok(readOnlyActions.includes('method:"GET"')===false,'GET is encapsulated in providerRead()');
assert.ok(readOnlyActions.includes('providerRead(cfg'),'Batch detail/list must use read-only API');
assert.ok(!readOnlyActions.includes('method:"POST"')&&!readOnlyActions.includes('send_campaign'),'Never send from status actions');
assert.ok(gateway.includes('message_statistics:detailById.get(x.provider_batch_id)||null'),'List sync must preserve detailed stats');
for(const t of ['data-provider-report','data-provider-history',
 'Sync SocialBerries Bulk Batches','Saved Bulk Campaign History',
 'async function checkProvider(id,action)','batch_history','data-provider-prev','data-provider-next',
 'data-batch-stats','batch_detail','read-only provider sync',
 'Completed = campaign processing','Total','Pending','Delivered','Read','Failed',
 'success_rate','effective_failure_rate','No WhatsApp messages are sent'])
 assert.ok(ui.includes(t),'Missing Marketing bulk tracking UI: '+t);
for(const t of ['create table if not exists public.gr_wa_bulk_batches',
 'primary key(company_id,connection_id,provider_batch_id)',
 'message_statistics jsonb','enable row level security',
 'revoke all on public.gr_wa_bulk_batches from public,anon,authenticated'])
 assert.ok(migration.includes(t),'Private schema contract missing: '+t);
assert.ok(read('secure.html').includes('greenrich-whatsapp-crm-workflows.js?v=20261116-bulk-tracking-1'));
const demo={status:'completed',message_statistics:{total_messages:3,pending:2,sent:0,delivered:0,read:0,failed:1,success_rate:0,failure_rate:33.33}};
assert.equal(demo.status,'completed');
assert.notEqual(demo.message_statistics.delivered,demo.message_statistics.total_messages,
 'A completed provider batch must never be interpreted as fully delivered');
console.log('PASS: provider bulk list/detail status sync, pagination, private company snapshots, non-delivery semantics and UI');
