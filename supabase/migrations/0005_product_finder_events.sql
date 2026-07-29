begin;

create table public.product_finder_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_session_id uuid not null,
  event_name text not null check (event_name in (
    'product_finder_started','product_finder_question_viewed','product_finder_answered',
    'product_finder_back','product_finder_abandoned','product_finder_testimonial_viewed',
    'product_finder_eligibility_failed','product_finder_completed',
    'product_recommendation_viewed','recommended_bundle_added','recommendation_changed'
  )),
  survey_version text not null,
  step_id text,
  phase text check (phase is null or phase in ('goals','preferences','eligibility','recommendation')),
  result_type text check (result_type is null or result_type in ('product','bundle','no-match')),
  created_at timestamptz not null default now()
);

create index product_finder_events_created_idx on public.product_finder_events(created_at desc);
alter table public.product_finder_events enable row level security;
create policy "anonymous product finder event insert"
  on public.product_finder_events for insert to anon, authenticated
  with check (survey_version = '1');

revoke all on public.product_finder_events from anon, authenticated;
grant insert on public.product_finder_events to anon, authenticated;

commit;
