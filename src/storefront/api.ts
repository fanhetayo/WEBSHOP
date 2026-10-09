import { client } from '../../supabaseClient';
import { getProducts } from '../lib/api';
import type { Product } from '../types';
import { UUID, validateContent, validatePreferences, type ContentItem, type ContentDraft, type ContentKind, type StorefrontPreferences } from './model';
const contentTable = 'zyha_storefront_content';
const preferencesTable = 'zyha_storefront_preferences';
const summaryFields = 'id,kind,title,summary,image_url,link_url,button_label,payment_method_id,sort_order,published,version,created_at,updated_at';
export async function getPreferences(): Promise<StorefrontPreferences> {
  const { data, error } = await client().from(preferencesTable).select('*').eq('id', 1).single();
  if (error) throw error; return data as StorefrontPreferences;
}
export async function getContent(kind: ContentKind, admin = false, page = 0) {
  let q = client().from(contentTable).select(summaryFields, { count: 'exact' }).eq('kind', kind)
    .order('sort_order').order('created_at', { ascending: false }).order('id');
  if (!admin) q = q.eq('published', true);
  const size = admin ? 20 : kind === 'article' ? 6 : 24;
  const { data, count, error } = await q.range(page * size, page * size + size - 1);
  if (error) throw error; return { rows: (data || []) as Omit<ContentItem, 'body'>[], count: count || 0 };
}
export async function getContentItem(id: string, admin = false): Promise<ContentItem | null> {
  if (!UUID.test(id)) return null;
  let q = client().from(contentTable).select('*').eq('id', id);
  if (!admin) q = q.eq('published', true);
  const { data, error } = await q.maybeSingle(); if (error) throw error; return data as ContentItem | null;
}
export async function saveContent(input: ContentDraft, original?: ContentItem) {
  const payload = validateContent(input);
  const { kind, ...mutable } = payload;
  const q = original ? client().from(contentTable).update(mutable).eq('id', original.id).eq('version', original.version)
    : client().from(contentTable).insert({ kind, ...mutable });
  const { data, error } = await q.select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Konten berubah atau akses ditolak. Muat ulang sebelum menyimpan.');
  return data as ContentItem;
}
export async function savePreferences(input: StorefrontPreferences) {
  const { id, version, updated_at, ...payload } = validatePreferences(input);
  const { data, error } = await client().from(preferencesTable).update(payload).eq('id', 1).eq('version', version).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Pengaturan konten sudah berubah. Muat ulang sebelum menyimpan.');
  return data as StorefrontPreferences;
}
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const safe = [...new Set(ids.filter(id => UUID.test(id)))].slice(0, 100);
  if (!safe.length) return [];
  const { data, error } = await client().from('products').select('*').eq('is_active', true).in('id', safe).limit(100);
  if (error) throw error;
  const rows = (data || []) as Product[];
  return safe.flatMap(id => rows.filter(p => p.id === id));
}
export async function getFeaturedProducts(ids: string[]): Promise<Product[]> {
  return ids.length ? getProductsByIds(ids.slice(0, 24)) : (await getProducts({ page: 0, category: '', search: '', sort: 'newest' })).rows;
}
export async function getPublicContent() {
  const [preferences, banner, article, trust, payment] = await Promise.all([
    getPreferences(), getContent('banner'), getContent('article'), getContent('trust'), getContent('payment'),
  ]);
  return { preferences, banner: banner.rows, article: article.rows, trust: trust.rows, payment: payment.rows };
}
