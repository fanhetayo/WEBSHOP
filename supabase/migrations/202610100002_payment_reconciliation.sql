-- Existing installations: atomic replacement; existing function ACLs are preserved.
begin;
create or replace function public.zyha_apply_gateway_status(p_id uuid,p_status text,p_amount bigint,p_transaction text,p_refund bigint default 0,p_gateway_state text default '')
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.orders; line jsonb; available integer; shortage boolean=false;
begin
 select * into r from public.orders where id=p_id for update;
 if not found or r.payment_snapshot->>'type'<>'Midtrans' or r.total_price<>p_amount then raise exception 'Gateway order/amount mismatch'; end if;
 if p_status not in ('pending','paid','cancelled','expired','failed','refunded','partial_refund') or p_refund<0 or p_refund>r.total_price then raise exception 'Invalid gateway state'; end if;
 if r.gateway_transaction_id is not null and r.gateway_transaction_id<>p_transaction then raise exception 'Gateway transaction mismatch'; end if;
 -- Ordinary refund snapshots cannot clear a recorded dispute/reversal hold.
 if r.gateway_state in ('deny','failure','chargeback','partial_chargeback') and p_status='partial_refund' and p_gateway_state is distinct from 'partial_chargeback' then return false; end if;
 if r.status='refunded' or (r.status='partial_refund' and p_status in ('pending','paid','cancelled','expired')) or (r.status='paid' and p_status in ('pending','expired')) or (r.status='paid' and p_status='cancelled' and coalesce(r.gateway_state,'')<>'capture') or (r.gateway_state='settlement' and p_gateway_state='capture') or (r.status in ('cancelled','expired','failed') and p_status='pending') or (r.gateway_state in ('deny','failure','chargeback','partial_chargeback') and p_status in ('pending','paid')) then return false; end if;
 if r.status=p_status and r.refund_amount>=p_refund and r.gateway_state=p_gateway_state and r.gateway_transaction_id=p_transaction then return false; end if;
 -- Financial disputes/refunds are not evidence of returned goods.
 if p_status in ('cancelled','expired','failed') and p_gateway_state not in ('chargeback','partial_chargeback') and r.fulfillment_status in ('unfulfilled','processing') and r.status in ('pending','paid') then perform public.zyha_restore_stock(r.id); end if;
 -- Never reject a real late settlement merely because an earlier expiry released stock.
 -- Re-reserve what is possible; the admin sees a precise reconciliation note.
 if p_status='paid' and r.stock_restored then
  perform 1 from public.products where id in(select (value->>'product_id')::uuid from jsonb_array_elements(r.items)) order by id for update;
  for line in select value from jsonb_array_elements(r.items) loop
   if (line->>'stock_tracked')::boolean then
    select stock into available from public.products where id=(line->>'product_id')::uuid;
    if available is not null then
     if available<(line->>'quantity')::integer then shortage=true; end if;
     update public.products set stock=greatest(stock-(line->>'quantity')::integer,0) where id=(line->>'product_id')::uuid;
    end if;
   end if;
  end loop;
 end if;
 update public.orders set status=p_status,gateway_transaction_id=p_transaction,gateway_state=p_gateway_state,
 refund_amount=case when p_status='refunded' then total_price else greatest(refund_amount,p_refund) end,
 stock_restored=case when p_status='paid' then false else stock_restored end,
 inventory_note=case when p_gateway_state in ('chargeback','partial_chargeback','deny','failure') then 'STOP fulfillment: provider reversal/dispute. Reconcile funds and physical goods; no automatic return of shipped goods. Missing partial chargeback amount excludes order from revenue pending reconciliation.' when shortage then 'Pembayaran terlambat diterima setelah pelepasan stok. Periksa ketersediaan fisik sebelum pengiriman.' when p_status='cancelled' and r.status='paid' and r.fulfillment_status in ('shipped','completed') then 'Transaksi capture dibatalkan di Midtrans setelah pengiriman. Rekonsiliasi dana dan barang secara manual.' else inventory_note end,
 version=version+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.order_events(order_id,event,old_status,new_status,note) values(p_id,'midtrans_verified',r.status,p_status,'Status diperiksa melalui API server Midtrans.');
 return true;
end $$;

create or replace function public.zyha_cancel_unstarted(p_id uuid,p_version bigint,p_note text,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.orders;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor and is_active) then raise exception 'Akses Admin diperlukan'; end if;
 if p_note is null or length(btrim(p_note)) not between 3 and 2000 then raise exception 'Isi alasan pembatalan'; end if;
 select * into r from public.orders where id=p_id for update;
 if not found or p_version is null or r.version<>p_version then raise exception 'Pesanan telah berubah. Muat ulang.'; end if;
 if r.status<>'pending' or r.payment_snapshot->>'type'<>'Midtrans' or r.snap_token is not null or r.gateway_transaction_id is not null or r.payment_lock_id is not null or r.payment_lock_until>now() or r.created_at>now()-interval '5 minutes' then raise exception 'Hanya pesanan minimal 5 menit tanpa percobaan/token/transaksi pembayaran yang dapat dibatalkan di sini.'; end if;
 perform public.zyha_restore_stock(r.id);
 update public.orders set status='cancelled',version=version+1,updated_at=clock_timestamp() where id=r.id;
 insert into public.order_events(order_id,actor_id,event,old_status,new_status,note) values(r.id,p_actor,'admin_cancelled',r.status,'cancelled',btrim(p_note));
 return true;
end $$;

create or replace function public.zyha_admin_order_action(p_id uuid,p_version bigint,p_action text,p_note text,p_tracking text default '',p_carrier text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.orders; next_status text; next_fulfillment text;
begin
 if not public.zyha_is_admin() then raise exception 'Akses Admin diperlukan'; end if;
 if p_note is null or length(btrim(p_note)) not between 3 and 2000 then raise exception 'Isi alasan minimal 3 karakter'; end if;
 select * into r from public.orders where id=p_id for update;
 if not found then raise exception 'Pesanan tidak ditemukan'; end if;
 if p_version is null or r.version<>p_version then raise exception 'Pesanan telah diperbarui. Muat ulang sebelum mengubah.'; end if;
 next_status=r.status; next_fulfillment=r.fulfillment_status;
 if p_action in ('paid','cancelled') then
  if r.payment_snapshot->>'type'='Midtrans' then raise exception 'Status pembayaran Midtrans harus dikonfirmasi server Midtrans'; end if;
  if r.status<>'pending' then raise exception 'Hanya pembayaran tertunda yang dapat diverifikasi/dibatalkan'; end if;
  next_status=p_action;
  if p_action='cancelled' then perform public.zyha_restore_stock(r.id); end if;
 elsif p_action in ('processing','shipped','completed') then
  if r.status not in ('paid','partial_refund') or r.gateway_state in ('chargeback','partial_chargeback','deny','failure') then raise exception 'Pesanan harus lunas dan bebas sengketa sebelum diproses'; end if;
  if not ((r.fulfillment_status='unfulfilled' and p_action='processing') or (r.fulfillment_status='processing' and p_action='shipped') or (r.fulfillment_status='shipped' and p_action='completed')) then raise exception 'Urutan status pengiriman tidak valid'; end if;
  if p_action='shipped' and (coalesce(length(btrim(p_tracking)),0)=0 or coalesce(length(btrim(p_carrier)),0)=0) then raise exception 'Isi kurir dan nomor resi'; end if;
  next_fulfillment=p_action;
 else raise exception 'Tindakan tidak valid'; end if;
 update public.orders set status=next_status,fulfillment_status=next_fulfillment,
 tracking_number=case when p_action='shipped' then btrim(p_tracking) else tracking_number end,
 carrier=case when p_action='shipped' then btrim(p_carrier) else carrier end,
 version=version+1,updated_at=clock_timestamp() where id=r.id;
 insert into public.order_events(order_id,actor_id,event,old_status,new_status,note) values(r.id,auth.uid(),'admin_'||p_action,r.status,next_status,btrim(p_note));
 return jsonb_build_object('ok',true);
end $$;
commit;