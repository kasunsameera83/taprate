-- Sentiment column: set by the database from the confirmed rating, never by users.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.eq_text(p_actual text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
end $$;

-- Thresholds per scale (must match iconSets.ts).
select pg_temp.eq_text(public.rating_sentiment('faces5', 5::smallint), 'positive', 'faces5 5');
select pg_temp.eq_text(public.rating_sentiment('faces5', 4::smallint), 'positive', 'faces5 4');
select pg_temp.eq_text(public.rating_sentiment('faces5', 3::smallint), 'neutral', 'faces5 3');
select pg_temp.eq_text(public.rating_sentiment('faces5', 2::smallint), 'negative', 'faces5 2');
select pg_temp.eq_text(public.rating_sentiment('stars5', 1::smallint), 'negative', 'stars5 1');
select pg_temp.eq_text(public.rating_sentiment('faces3', 2::smallint), 'neutral', 'faces3 2');
select pg_temp.eq_text(public.rating_sentiment('faces3', 1::smallint), 'negative', 'faces3 1');
select pg_temp.eq_text(public.rating_sentiment('thumbs', 1::smallint), 'negative', 'thumbs 1');
select pg_temp.eq_text(public.rating_sentiment('thumbs', 2::smallint), 'positive', 'thumbs 2');
select pg_temp.eq_text(public.rating_sentiment('nps', 6::smallint), 'negative', 'nps 6');
select pg_temp.eq_text(public.rating_sentiment('nps', 7::smallint), 'neutral', 'nps 7');
select pg_temp.eq_text(public.rating_sentiment('nps', 9::smallint), 'positive', 'nps 9');
select pg_temp.eq_text(public.rating_sentiment('faces5', null), null, 'null rating');

-- Backfill + trigger: existing confirmed response (rating 4 on faces5 from test 10) is positive.
select pg_temp.eq_text((select sentiment from public.responses where dedupe_key = repeat('d',64)), 'positive', 'backfilled sentiment');

-- New click -> pending has no sentiment; confirm sets it.
set role service_role;
create temp table s1 as select public.record_click('5a000000-0000-0000-0000-000000000001', 1::smallint, repeat('9',64), null, null, null, false, null, 'Mozilla') as id;
reset role;
select pg_temp.eq_text((select sentiment from public.responses where id = (select id from s1)), null, 'pending has no sentiment');
set role service_role;
select * from public.confirm_response((select id from s1));
reset role;
select pg_temp.eq_text((select sentiment from public.responses where id = (select id from s1)), 'negative', 'confirmed 1 is negative');

-- Users still cannot write sentiment.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
do $$ begin
  begin
    update public.responses set sentiment = 'positive';
    raise exception 'SECURITY TEST FAILED: user changed sentiment';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.eq_text((select count(*)::text from public.responses where sentiment = 'negative'), '1', 'owner reads sentiment');
reset role;

select 'ALL SENTIMENT TESTS PASSED' as result;
