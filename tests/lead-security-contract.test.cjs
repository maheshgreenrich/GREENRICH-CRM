'use strict';
// Non-destructive contract tests: read repository files only.
// Run: node --test tests/lead-security-contract.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('lead pipeline uses named RPCs for sensitive writes', () => {
  const code = read('greenrich-lead-pipeline.js');
  for (const rpc of ['gr_pipeline_create','gr_pipeline_assign','gr_pipeline_advance','gr_pipeline_link_customer','gr_pipeline_win_with_order']) {
    assert.ok(code.includes("rpc('"+rpc+"'"), 'Missing RPC: '+rpc);
  }
  assert.doesNotMatch(code, /from\(['"]gr_lead_pipeline['"]\)\.\s*(insert|update|delete|upsert)\s*\(/);
});

test('follow-up response is routed through an RPC', () => {
  const code = read('greenrich-followup-alarm.js');
  assert.ok(code.includes("rpc('gr_pipeline_followup_respond'"));
});

test('lead profile reads scoped lead and history records', () => {
  const code = read('greenrich-lead-profile.js');
  assert.match(code, /from\(['"]gr_lead_pipeline['"]\)/);
  assert.match(code, /from\(['"]gr_lead_stage_history['"]\)/);
  assert.match(code, /\.eq\(['"]company_id['"],\s*company\)/);
  assert.match(code, /\.eq\(['"]lead_id['"],\s*leadId\)/);
});

test('browser source contains no embedded service-role credential', () => {
  for (const file of ['greenrich-lead-pipeline.js','greenrich-lead-profile.js','greenrich-followup-alarm.js','greenrich-crm-cloud.js']) {
    const code = read(file);
    assert.doesNotMatch(code, /SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]/i, file);
  }
});

// IMPORTANT: These static checks do NOT prove authorization. Real RLS/RPC
// tests require a disposable staging project and authenticated test users.
