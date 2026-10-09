/** New public merchandising data only. Never put payment keys or customer data here. */
export type ContentKind = 'banner' | 'article' | 'trust' | 'payment';
export interface ContentItem {
  id: string; slug: string | null; kind: ContentKind; title: string; summary: string; body: string;
  image_url: string; link_url: string; button_label: string;
  payment_method_id: string | null; sort_order: number; published: boolean;
  version: number; created_at: string; updated_at: string;
}
export type ContentDraft = Omit<ContentItem, 'id' | 'slug' | 'version' | 'created_at' | 'updated_at'>;
export interface StorefrontPreferences {
  id: number; banner_autoplay: boolean; banner_seconds: number;
  product_carousel: boolean; product_autoplay: boolean; product_seconds: number;
  featured_ids: string[]; product_heading: string; articles_enabled: boolean;
  article_heading: string; payments_enabled: boolean; payment_heading: string;
  trust_enabled: boolean; wishlist_enabled: boolean; quick_view_enabled: boolean;
  chat_enabled: boolean; chat_label: string; chat_message: string; promotion_text: string;
  version: number; updated_at: string;
}
export const DEFAULT_PREFERENCES: StorefrontPreferences = {
  id: 1, banner_autoplay: true, banner_seconds: 6,
  product_carousel: true, product_autoplay: true, product_seconds: 5,
  featured_ids: [], product_heading: 'Pilihan produk', articles_enabled: true,
  article_heading: 'Artikel / Tips Terbaru', payments_enabled: true,
  payment_heading: 'Metode pembayaran', trust_enabled: true, wishlist_enabled: true,
  quick_view_enabled: true, chat_enabled: true, chat_label: 'Hubungi toko',
  chat_message: 'Halo, saya ingin bertanya tentang produk.', promotion_text: '',
  version: 1, updated_at: '',
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeContentLink(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\s\\\u0000-\u001f]/.test(value)) return '';
  if (value.startsWith('#')) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? value : ''; } catch { return ''; }
}
export function parseWishlist(raw: string | null): string[] {
  if (raw && raw.length > 10000) return [];
  try { const value: unknown = JSON.parse(raw || '[]'); return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, 100) : []; } catch { return []; }
}
export function validateContent(input: ContentDraft): ContentDraft {
  const v = { ...input, title: input.title.trim(), summary: input.summary.trim(), body: input.body.trim(), image_url: input.image_url.trim(), link_url: input.link_url.trim(), button_label: input.button_label.trim() };
  if (!['banner', 'article', 'trust', 'payment'].includes(v.kind)) throw new Error('Jenis konten tidak valid.');
  if (!v.title || v.title.length > 160 || v.summary.length > 700 || v.body.length > 30000 || v.button_label.length > 60) throw new Error('Judul wajib diisi; panjang teks melewati batas.');
  if (v.image_url && (!safeContentLink(v.image_url) || !v.image_url.startsWith('https://'))) throw new Error('URL gambar harus HTTPS yang valid.');
  if (v.link_url && !safeContentLink(v.link_url)) throw new Error('Tautan harus #anchor, path /toko, atau HTTPS.');
  if (!Number.isInteger(v.sort_order) || Math.abs(v.sort_order) > 100000) throw new Error('Urutan harus bilangan bulat antara -100000 dan 100000.');
  if (v.kind === 'payment' && !UUID.test(v.payment_method_id || '')) throw new Error('Pilih metode pembayaran untuk logo ini.');
  if (v.published && v.kind === 'article' && !v.body) throw new Error('Isi artikel wajib diisi sebelum publikasi.');
  if (v.published && v.kind === 'trust' && !v.summary) throw new Error('Jelaskan kebijakan toko yang benar-benar berlaku.');
  return { kind: v.kind, title: v.title, summary: v.summary, body: v.body, image_url: v.image_url, link_url: v.link_url, button_label: v.button_label, sort_order: v.sort_order, published: v.published, payment_method_id: v.kind === 'payment' ? v.payment_method_id : null };
}
export function validatePreferences(v: StorefrontPreferences): StorefrontPreferences {
  for (const n of [v.banner_seconds, v.product_seconds]) if (!Number.isInteger(n) || n < 3 || n > 20) throw new Error('Jeda autoplay harus 3–20 detik.');
  if (!Array.isArray(v.featured_ids) || v.featured_ids.length > 24 || v.featured_ids.some(id => !UUID.test(id))) throw new Error('Pilih maksimal 24 produk yang valid.');
  for (const s of [v.product_heading, v.article_heading, v.payment_heading, v.chat_label]) if (!s.trim() || s.length > 160) throw new Error('Judul/label wajib diisi, maksimal 160 karakter.');
  if (v.promotion_text.length > 500 || v.chat_message.length > 700) throw new Error('Teks promosi/chat terlalu panjang.');
  return { ...v, featured_ids: [...new Set(v.featured_ids)] };
}
