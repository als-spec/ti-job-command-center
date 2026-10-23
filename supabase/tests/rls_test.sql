\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@acme.com'),('22222222-2222-2222-2222-222222222222','b@other.com'),('33333333-3333-3333-3333-333333333333','super@acme.com');
insert into public.companies (id,name,billing_email) values ('aaaaaaaa-0000-0000-0000-000000000001','Acme','a@acme.com'),('bbbbbbbb-0000-0000-0000-000000000002','Other','b@other.com');
insert into public.memberships values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','owner'),('bbbbbbbb-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','owner');
insert into public.jobs (id,company_id,name,contract_value,ti_allowance,budget_cost) values
 ('a0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','Acme job',160000,200000,136000),
 ('b0000000-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000002','Other job',1,1,1);
insert into public.invites (company_id,email) values ('aaaaaaaa-0000-0000-0000-000000000001','super@acme.com');

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ begin
  assert (select count(*) from public.jobs) = 1, 'A should see only own job';
  assert (select name from public.jobs) = 'Acme job', 'wrong job visible';
  assert (select count(*) from public.companies) = 1, 'A should see only own company';
end $$;
-- A cannot write into company B
do $$ begin
  begin
    insert into public.jobs (company_id,name) values ('bbbbbbbb-0000-0000-0000-000000000002','sneaky');
    raise exception 'cross-company insert was allowed';
  exception when insufficient_privilege then null; end;
end $$;
-- updates to B's job silently affect 0 rows
update public.jobs set name='hacked' where id='b0000000-0000-0000-0000-00000000000b';
-- CO numbering and signed lock
insert into public.change_orders (company_id,job_id,number,title,price,status) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a', public.next_co_number('a0000000-0000-0000-0000-00000000000a'),'Outlet',500,'signed');
do $$ begin assert public.next_co_number('a0000000-0000-0000-0000-00000000000a') = 2, 'numbering'; end $$;
do $$ begin
  begin
    update public.change_orders set price = 1 where title='Outlet';
    raise exception 'edit of signed CO was allowed';
  exception when raise_exception then
    if sqlerrm not like 'Signed change orders cannot be edited%' then raise; end if;
  end;
end $$;
update public.change_orders set status='void', sign_token=null where title='Outlet';
do $$ begin assert (select status from public.change_orders where title='Outlet')='void','void should be allowed'; end $$;

-- invite claim for the super
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$ begin assert (select count(*) from public.jobs)=0, 'super sees nothing before claiming'; end $$;
select public.claim_invites();
do $$ begin assert (select count(*) from public.jobs)=1, 'super sees Acme job after claiming'; end $$;
-- members (not owners) cannot manage invites
do $$ begin assert (select count(*) from public.invites)=0, 'member should not see invites'; end $$;

reset role;
do $$ begin assert (select name from public.jobs where id='b0000000-0000-0000-0000-00000000000b')='Other job','B job must be untouched'; end $$;
-- canceled company: no new rows
update public.companies set status='canceled' where name='Acme';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ begin
  begin
    insert into public.jobs (company_id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','after cancel');
    raise exception 'insert after cancel was allowed';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.jobs)=1, 'canceled company can still read';
end $$;
select 'ALL_RLS_TESTS_PASSED';
