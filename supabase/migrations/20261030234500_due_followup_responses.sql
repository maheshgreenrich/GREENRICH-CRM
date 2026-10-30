-- Lead due reminders: only authorized staff may acknowledge or reschedule.
-- Never clear reminders solely because browser popup was dismissed.
create or replace function public.gr_pipeline_followup_respond(
  p_company text,p_lead text,p_note text default null,p_next_at timestamptz default null
) returns void language plpgsql security definer set search_path=''
as $function$
declare v public.gr_lead_pipeline%rowtype;
begin
 select * into v from public.gr_lead_pipeline
  where company_id=p_company and lead_id=p_lead for update;
 if not found or not public.gr_lead_can(p_company,v.assigned_to,'edit')
 then raise exception 'Lead not found or permission denied';end if;
 if v.stage='Won' then raise exception 'Won leads do not require follow-ups';end if;
 if nullif(trim(coalesce(p_note,'')),'') is null and p_next_at is null
 then raise exception 'Enter a conversation note or a new follow-up date and time';end if;
 if p_next_at is not null and p_next_at<=now()
 then raise exception 'New follow-up must be a future date and time';end if;
 if p_note is not null and length(p_note)>4000
 then raise exception 'Conversation note is too long';end if;
 insert into public.gr_lead_stage_history
  (company_id,lead_id,actor_id,event_type,old_stage,new_stage,note)
 values(p_company,p_lead,auth.uid(),'FOLLOWUP',v.stage,v.stage,
  coalesce(nullif(trim(p_note),''),'Follow-up rescheduled')||
  case when p_next_at is null then ' · Reminder acknowledged'
       else ' · Next follow-up: '||to_char(p_next_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI') end);
 update public.gr_lead_pipeline
  set next_followup_at=p_next_at,
      next_followup=case when p_next_at is null then null else (p_next_at at time zone 'Asia/Kolkata')::date end,
      updated_at=now()
 where company_id=p_company and lead_id=p_lead;
 update public.gr_crm_records
  set payload=payload||jsonb_build_object('next_followup_at',p_next_at),
      updated_at=now()
 where company_id=p_company and kind='leads' and record_id=p_lead;
end $function$;
revoke all on function public.gr_pipeline_followup_respond(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.gr_pipeline_followup_respond(text,text,text,timestamptz) to authenticated;