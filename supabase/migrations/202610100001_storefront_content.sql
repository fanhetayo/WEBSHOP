-- Apply after supabase-setup.sql (payment_methods and zyha_is_admin are required).
begin;
create table if not exists public.zyha_storefront_preferences (
  id integer primary key default 1 check(id=1),
  banner_autoplay boolean not null default true,
  banner_seconds integer not null default 6 check(banner_seconds between 3 and 20),
  product_carousel boolean not null default true,
  product_autoplay boolean not null default true,
  product_seconds integer not null default 5 check(product_seconds between 3 and 20),
  featured_ids uuid[] not null default '{}' check(cardinality(featured_ids)<=24 and array_position(featured_ids,null) is null),
  product_heading text not null default 'Pilihan produk' check(length(btrim(product_heading)) between 1 and 160),
  articles_enabled boolean not null default true,
  article_heading text not null default 'Artikel / Tips Terbaru' check(length(btrim(article_heading)) between 1 and 160),
  payments_enabled boolean not null default true,
  payment_heading text not null default 'Metode pembayaran' check(length(btrim(payment_heading)) between 1 and 160),
  trust_enabled boolean not null default true,
  wishlist_enabled boolean not null default true,
  quick_view_enabled boolean not null default true,
  chat_enabled boolean not null default true,
  chat_label text not null default 'Hubungi toko' check(length(btrim(chat_label)) between 1 and 160),
  chat_message text not null default 'Halo, saya ingin bertanya tentang produk.' check(length(chat_message)<=700),
  promotion_text text not null default '' check(length(promotion_text)<=500),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists public.zyha_storefront_content (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('banner','article','trust','payment')),
  title text not null check(length(btrim(title)) between 1 and 160),
  summary text not null default '' check(length(summary)<=700),
  body text not null default '' check(length(body)<=30000),
  image_url text not null default '' check(length(image_url)<=2000 and (image_url='' or image_url ~ '^https://')),
  link_url text not null default '' check(length(link_url)<=2000 and (link_url='' or link_url ~ '^(https://|/[^/]|/$|#)') and link_url !~ '[[:space:]\\]'),
  button_label text not null default '' check(length(button_label)<=60),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  sort_order integer not null default 0 check(sort_order between -100000 and 100000),
  published boolean not null default false,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(not published or kind<>'article' or length(btrim(body))>0),
  check(not published or kind<>'trust' or length(btrim(summary))>0)
);
-- Defaults are configuration only: no fabricated banners, articles, bank logos or guarantees.
insert into public.zyha_storefront_preferences(id) values(1) on conflict(id) do nothing;
create index if not exists zyha_content_list_idx on public.zyha_storefront_content(kind,published,sort_order,created_at desc,id);
create or replace function public.zyha_content_touch() returns trigger
language plpgsql set search_path='' as $$
begin
  new.version := old.version+1;
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.zyha_content_touch() from public,anon,authenticated;
drop trigger if exists zyha_content_touch on public.zyha_storefront_content;
create trigger zyha_content_touch before update on public.zyha_storefront_content for each row execute function public.zyha_content_touch();
drop trigger if exists zyha_preferences_touch on public.zyha_storefront_preferences;
create trigger zyha_preferences_touch before update on public.zyha_storefront_preferences for each row execute function public.zyha_content_touch();
alter table public.zyha_storefront_content enable row level security;
alter table public.zyha_storefront_preferences enable row level security;
revoke all on public.zyha_storefront_content,public.zyha_storefront_preferences from public,anon,authenticated;
grant select on public.zyha_storefront_content,public.zyha_storefront_preferences to anon,authenticated;
grant insert(kind,title,summary,body,image_url,link_url,button_label,payment_method_id,sort_order,published),
 update(title,summary,body,image_url,link_url,button_label,payment_method_id,sort_order,published)
 on public.zyha_storefront_content to authenticated;
grant update(banner_autoplay,banner_seconds,product_carousel,product_autoplay,product_seconds,featured_ids,product_heading,articles_enabled,article_heading,payments_enabled,payment_heading,trust_enabled,wishlist_enabled,quick_view_enabled,chat_enabled,chat_label,chat_message,promotion_text)
 on public.zyha_storefront_preferences to authenticated;
grant all on public.zyha_storefront_content,public.zyha_storefront_preferences to service_role;
drop policy if exists zyha_content_public on public.zyha_storefront_content;
create policy zyha_content_public on public.zyha_storefront_content for select to anon,authenticated using(published);
drop policy if exists zyha_content_admin on public.zyha_storefront_content;
create policy zyha_content_admin on public.zyha_storefront_content for all to authenticated using((select public.zyha_is_admin())) with check((select public.zyha_is_admin()));
drop policy if exists zyha_preferences_read on public.zyha_storefront_preferences;
create policy zyha_preferences_read on public.zyha_storefront_preferences for select to anon,authenticated using(true);
drop policy if exists zyha_preferences_admin on public.zyha_storefront_preferences;
create policy zyha_preferences_admin on public.zyha_storefront_preferences for update to authenticated using((select public.zyha_is_admin())) with check((select public.zyha_is_admin()));
-- Only add the extension's tables to an existing realtime publication.
do $$ declare name text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    foreach name in array array['zyha_storefront_content','zyha_storefront_preferences'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=name) then
        execute format('alter publication supabase_realtime add table public.%I',name);
      end if;
    end loop;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
