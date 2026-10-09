-- STAGING ONLY, postgres SQL Editor; run after setup or reconciliation migration.
-- Auth is stubbed ONLY inside this rolled-back test transaction.
begin;
set local statement_timeout='30s';
create or replace function public.zyha_is_admin() returns boolean
language sql stable security definer set search_path='' as $$ select true $$;
do $$
declare p uuid; m uuid; o uuid; total bigint; f text; ver bigint; events bigint;
begin
 insert into public.products(title,price,stock) values('QA reconciliation',100,20) returning id into p;
 insert into public.payment_methods(name,type,account_number,account_holder) values('QA bank','Bank','1','QA') returning id into m;
 foreach f in array array['unfulfilled','processing','shipped','completed'] loop
  o=public.zyha_place_order(gen_random_uuid(),repeat('a',64),repeat('b',64),jsonb_build_array(jsonb_build_object('product_id',p,'variant','','quantity',1)),
   '{"name":"QA buyer","address":"QA staging address","phone":"6281234567890","note":""}',m);
  update public.orders set payment_snapshot='{"type":"Midtrans"}',fulfillment_status=f where id=o;
  select total_price into total from public.orders where id=o;
  perform public.zyha_apply_gateway_status(o,'paid',total,'qa-'||o,0,'settlement');
  perform public.zyha_apply_gateway_status(o,'failed',total,'qa-'||o,0,'deny');
  if (select status from public.orders where id=o)<>'failed' then raise exception 'FAIL reversal ignored'; end if;
  if (select stock_restored from public.orders where id=o)<>(f in ('unfulfilled','processing')) then raise exception 'FAIL incorrect restock %',f; end if;
  select count(*) into events from public.order_events where order_id=o;
  if public.zyha_apply_gateway_status(o,'failed',total,'qa-'||o,0,'deny') then raise exception 'FAIL duplicate'; end if;
  if public.zyha_apply_gateway_status(o,'paid',total,'qa-'||o,0,'settlement') then raise exception 'FAIL stale settlement undid reversal'; end if;
  if (select count(*) from public.order_events where order_id=o)<>events then raise exception 'FAIL duplicate event'; end if;
 end loop;
 if (select stock from public.products where id=p)<>18 then raise exception 'FAIL shipped stock restored'; end if;
 -- Use last shipped/completed order to check financial reconciliation without returns.
 perform public.zyha_apply_gateway_status(o,'failed',total,'qa-'||o,0,'partial_chargeback');
 perform public.zyha_apply_gateway_status(o,'partial_refund',total,'qa-'||o,30,'partial_chargeback');
 if (select refund_amount from public.orders where id=o)<>30 then raise exception 'FAIL cumulative chargeback'; end if;
 select count(*) into events from public.order_events where order_id=o;
 if public.zyha_apply_gateway_status(o,'partial_refund',total,'qa-'||o,30,'partial_chargeback') then raise exception 'FAIL repeated partial chargeback'; end if;
 if public.zyha_apply_gateway_status(o,'partial_refund',total,'qa-'||o,20,'partial_chargeback') then raise exception 'FAIL decreasing cumulative chargeback'; end if;
 if public.zyha_apply_gateway_status(o,'partial_refund',total,'qa-'||o,40,'partial_refund') then raise exception 'FAIL ordinary refund cleared dispute'; end if;
 if (select count(*) from public.order_events where order_id=o)<>events then raise exception 'FAIL duplicate dispute event'; end if;
 perform public.zyha_apply_gateway_status(o,'partial_refund',total,'qa-'||o,40,'partial_chargeback');
 if (select refund_amount from public.orders where id=o)<>40 then raise exception 'FAIL increasing cumulative chargeback'; end if;
 perform public.zyha_apply_gateway_status(o,'failed',total,'qa-'||o,0,'partial_chargeback');
 if (select refund_amount from public.orders where id=o)<>40 then raise exception 'FAIL missing amount erased known refund'; end if;
 perform public.zyha_apply_gateway_status(o,'partial_refund',total,'qa-'||o,40,'partial_chargeback');
 if (public.zyha_dashboard()->>'revenue')::numeric < total-40 then raise exception 'FAIL net revenue'; end if;
 update public.orders set fulfillment_status='processing' where id=o;
 select version into ver from public.orders where id=o;
 begin
  perform public.zyha_admin_order_action(o,ver,'shipped','QA dispute block','tracking','carrier');
  raise exception using errcode='ZQ001',message='FAIL disputed fulfillment allowed';
 exception when sqlstate 'P0001' then null; end;
 perform public.zyha_apply_gateway_status(o,'refunded',total,'qa-'||o,total,'chargeback');
 if (select refund_amount from public.orders where id=o)<>total or (select stock from public.products where id=p)<>18 then raise exception 'FAIL full chargeback accounting/stock'; end if;
 if public.zyha_apply_gateway_status(o,'refunded',total,'qa-'||o,total,'chargeback') then raise exception 'FAIL repeated full chargeback'; end if;
 if public.zyha_apply_gateway_status(o,'paid',total,'qa-'||o,0,'settlement') then raise exception 'FAIL full chargeback undone'; end if;
 raise notice 'PASS reversal, duplicate, stale settlement, shipped stock, chargeback, fulfillment';
end $$;
rollback;