import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { client, projectStorageKey } from '../../supabaseClient';
import type { PaymentMethod, Settings } from '../types';
import { Message, Modal, Photo } from '../components/UI';
import { getProduct } from '../lib/api';
import { errorMessage, money, whatsappUrl } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { openLiveChat } from '../shop/payment';
import { getContentItem, getFeaturedProducts, getProductsByIds, getPublicContent } from './api';
import { DEFAULT_PREFERENCES, parseWishlist, safeContentLink } from './model';
import { RotationControls, useAutoplay } from './Controls';

type StorefrontContextValue = {
  content: Awaited<ReturnType<typeof getPublicContent>> | null;
  store: Settings | null; methods: PaymentMethod[]; revision: number;
  openProduct: (id: string) => void; wishlist: string[]; toggle: (id: string) => void;
  showWishlist: () => void; quickView: (id: string) => void;
};
const StorefrontContext = createContext<StorefrontContextValue | null>(null);
function useStorefront() {
  const value = useContext(StorefrontContext);
  if (!value) throw new Error('StorefrontProvider is required.');
  return value;
}
export function StorefrontProvider({ children, store, methods, revision, onOpenProduct }: {
  children: ReactNode; store: Settings | null; methods: PaymentMethod[]; revision: number; onOpenProduct: (id: string) => void;
}) {
  const [contentRevision, setContentRevision] = useState(0);
  const content = useResource('storefront:' + revision + ':' + contentRevision, getPublicContent);
  const [wishlist, setWishlist] = useState<string[]>(() => {
    try { return parseWishlist(localStorage.getItem(projectStorageKey + 'wishlist')); } catch { return []; }
  });
  const [show, setShow] = useState(false), [quickId, setQuickId] = useState(''), [storageError, setStorageError] = useState('');
  useEffect(() => {
    try { localStorage.setItem(projectStorageKey + 'wishlist', JSON.stringify(wishlist)); }
    catch { setStorageError('Wishlist tidak dapat disimpan pada perangkat ini.'); }
  }, [wishlist]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === projectStorageKey + 'wishlist') setWishlist(parseWishlist(event.newValue)); };
    window.addEventListener('storage', sync);
    const channel = client().channel('zyha-storefront-content')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zyha_storefront_content' }, () => setContentRevision(n => n + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zyha_storefront_preferences' }, () => setContentRevision(n => n + 1)).subscribe();
    return () => { window.removeEventListener('storage', sync); void client().removeChannel(channel); };
  }, []);
  const openProduct = (id: string) => { setShow(false); setQuickId(''); onOpenProduct(id); };
  return <StorefrontContext.Provider value={{ content: content.data, store, methods, revision: revision + contentRevision, openProduct, wishlist,
    toggle: id => setWishlist(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id].slice(0, 100)),
    showWishlist: () => setShow(true), quickView: setQuickId }}>
    {children}
    <Message error={storageError || content.error} />
    {content.error && <button className="button secondary" onClick={content.reload}>Muat ulang konten toko</button>}
    <WishlistModal open={show} onClose={() => setShow(false)} />
    <QuickView id={quickId} onClose={() => setQuickId('')} />
  </StorefrontContext.Provider>;
}
function Outline({ name }: { name: 'chat' | 'heart' | 'eye' }) {
  return <svg className="store-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    {name === 'chat' ? <path d="M4 4h16v13H9l-5 4V4Z" /> : name === 'heart' ? <path d="M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6l-9 9Z" /> : <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>;
}
export function WishlistTrigger() {
  const ctx = useStorefront();
  return ctx.content?.preferences.wishlist_enabled ? <button type="button" className="text-button sf-inline" onClick={ctx.showWishlist}><Outline name="heart" />Wishlist ({ctx.wishlist.length})</button> : null;
}
export function ProductTools({ id }: { id: string }) {
  const ctx = useStorefront(), prefs = ctx.content?.preferences;
  return <div className="actions sf-product-tools">
    {prefs?.wishlist_enabled && <button type="button" className="text-button" aria-pressed={ctx.wishlist.includes(id)} onClick={() => ctx.toggle(id)}>{ctx.wishlist.includes(id) ? 'Hapus wishlist' : 'Simpan wishlist'}</button>}
    {prefs?.quick_view_enabled && <button type="button" className="text-button" onClick={() => ctx.quickView(id)}>Lihat cepat</button>}
  </div>;
}
function QuickView({ id, onClose }: { id: string; onClose: () => void }) {
  const ctx = useStorefront();
  const result = useResource('quick:' + id + ':' + ctx.revision, () => id ? getProduct(id) : Promise.resolve(null));
  const p = result.data;
  return <Modal open={!!id} title={p?.title || 'Lihat produk'} onClose={onClose}>
    <Message loading={result.loading} error={result.error} />
    {result.error && <button className="button secondary" onClick={result.reload}>Coba lagi</button>}
    {p ? <div className="stack"><Photo src={p.image_url || p.images[0]} alt={p.title} /><strong>{money(p.price)}</strong><p>{p.description}</p><button className="button" onClick={() => ctx.openProduct(p.id)}>Lihat detail / pilih varian</button></div> : !result.loading && !result.error && <p>Produk tidak tersedia.</p>}
  </Modal>;
}
function WishlistModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useStorefront();
  const result = useResource('wishlist:' + open + ':' + ctx.wishlist.join(',') + ':' + ctx.revision, () => open ? getProductsByIds(ctx.wishlist) : Promise.resolve([]));
  return <Modal open={open} title="Wishlist" onClose={onClose}>
    <Message loading={result.loading} error={result.error} />
    {result.error && <button className="button secondary" onClick={result.reload}>Coba lagi</button>}
    {!ctx.wishlist.length && <p>Wishlist masih kosong.</p>}
    <div className="stack">{ctx.wishlist.map(id => {
      const p = result.data?.find(item => item.id === id);
      return <article key={id} className="panel"><h3>{p?.title || 'Produk tidak tersedia'}</h3>{p && <button className="button secondary" onClick={() => ctx.openProduct(id)}>Lihat produk</button>}<button className="text-button" onClick={() => ctx.toggle(id)}>Hapus</button></article>;
    })}</div>
  </Modal>;
}
export function PromotionStrip() {
  const text = useStorefront().content?.preferences.promotion_text;
  return text ? <div className="sf-promotion">{text}</div> : null;
}
function ContentLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  const safe = safeContentLink(href);
  if (!safe) return <span className={className}>{children}</span>;
  return safe.startsWith('/') ? <Link className={className} to={safe}>{children}</Link> : <a className={className} href={safe} target={safe.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer">{children}</a>;
}
export function BannerCarousel({ children }: { children: ReactNode }) {
  const { content } = useStorefront(); const slides = content?.banner || [], prefs = content?.preferences || DEFAULT_PREFERENCES;
  const [index, setIndex] = useState(0); const current = slides.length ? index % slides.length : 0;
  const motion = useAutoplay(() => setIndex(i => (i + 1) % slides.length), slides.length > 1 && prefs.banner_autoplay, prefs.banner_seconds, slides.map(s => s.id + ':' + s.version).join('|'));
  const move = (n: number) => { motion.setPaused(true); setIndex(i => (i + n + slides.length) % slides.length); };
  return <section className="container hero-section sf-banner" ref={motion.ref} {...motion.bindings} aria-label="Promosi toko" aria-roledescription="carousel">
    {!slides.length ? children : <>
      <div className="sf-banner-stage" aria-live={motion.running ? 'off' : 'polite'}>
        {slides.map((s, i) => <div className={'sf-slide' + (i === current ? ' current' : '')} key={s.id} aria-hidden={i !== current} role="group" aria-roledescription="slide" aria-label={(i + 1) + ' dari ' + slides.length}>
          <div className="hero with-image"><div className="hero-media"><Photo src={s.image_url} alt={s.title} /></div>
            <div className="hero-copy"><h1>{s.title}</h1><p className="hero-description">{s.summary}</p>
              {i === current && s.link_url && <ContentLink href={s.link_url} className="button">{s.button_label || 'Lihat koleksi'}</ContentLink>}
            </div>
          </div>
        </div>)}
      </div>
      {slides.length > 1 && <RotationControls next={() => move(1)} previous={() => move(-1)} paused={motion.paused} onToggle={() => motion.setPaused(v => !v)} enabled={prefs.banner_autoplay} reduced={motion.reduced} />}
    </>}
  </section>;
}
export function ProductCarousel() {
  const ctx = useStorefront(), prefs = ctx.content?.preferences;
  const result = useResource('featured:' + (prefs?.product_carousel ? prefs.featured_ids.join(',') : 'off') + ':' + ctx.revision, () => prefs?.product_carousel ? getFeaturedProducts(prefs.featured_ids) : Promise.resolve([]));
  const track = useRef<HTMLDivElement>(null);
  const rows = result.data || [];
  function slide(n: number, reduced = false) {
    const el = track.current; if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    const step = (el.firstElementChild as HTMLElement | null)?.offsetWidth || el.clientWidth;
    const end = el.scrollWidth - el.clientWidth;
    const left = n > 0 && el.scrollLeft >= end - 3 ? 0 : n < 0 && el.scrollLeft <= 3 ? end : Math.max(0, Math.min(end, el.scrollLeft + n * (step + 20)));
    el.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
  }
  const auto = useAutoplay(() => slide(1), !!prefs?.product_autoplay && rows.length > 1, prefs?.product_seconds || 5, rows.map(r => r.id).join('|'));
  if (!prefs?.product_carousel) return null;
  return <section className="container section sf-featured" ref={auto.ref} {...auto.bindings} aria-label={prefs.product_heading} aria-roledescription="carousel">
    <div className="section-heading"><h2>{prefs.product_heading}</h2>{rows.length > 1 && <RotationControls next={() => { auto.setPaused(true); slide(1, auto.reduced); }} previous={() => { auto.setPaused(true); slide(-1, auto.reduced); }} paused={auto.paused} onToggle={() => auto.setPaused(v => !v)} enabled={prefs.product_autoplay} reduced={auto.reduced} />}</div>
    <Message loading={result.loading} error={result.error} />{result.error && <button className="button secondary" onClick={result.reload}>Muat ulang</button>}
    <div className="sf-product-track" ref={track} aria-live="off" onWheel={() => auto.setPaused(true)}>
      {rows.map(p => <article className="product-card" key={p.id}><button className="product-photo" onClick={() => ctx.openProduct(p.id)} aria-label={'Lihat ' + p.title}><Photo src={p.image_url || p.images[0]} alt={p.title} /></button>
        <div className="product-copy"><p className="eyebrow">{p.category}</p><h3><button className="product-name" onClick={() => ctx.openProduct(p.id)}>{p.title}</button></h3><strong>{money(p.price)}</strong>
          {p.stock === 0 && <small>Stok habis</small>}<ProductTools id={p.id} /></div></article>)}
    </div>
  </section>;
}
export function PaymentTrustSection() {
  const { content, methods, store } = useStorefront(); if (!content) return null;
  const prefs = content.preferences;
  const active = methods.filter(m => m.is_active && (m.type !== 'Midtrans' || store?.midtrans_enabled));
  return <div className="container sf-confidence">
    {prefs.payments_enabled && active.length > 0 && <section aria-label={prefs.payment_heading}><h2>{prefs.payment_heading}</h2><div className="sf-payment-logos">{active.map(m => {
      const branding = content.payment.find(c => c.payment_method_id === m.id);
      return <div className="sf-payment" key={m.id}>{branding?.image_url && <Photo src={branding.image_url} alt={'Logo ' + m.name} />}<span>{m.name}</span></div>;
    })}</div></section>}
    {prefs.trust_enabled && content.trust.length > 0 && <section className="sf-trust" aria-label="Informasi layanan toko">{content.trust.map(c => <article key={c.id}><h3>{c.title}</h3><p>{c.summary}</p>{c.link_url && <ContentLink href={c.link_url}>Baca kebijakan</ContentLink>}</article>)}</section>}
  </div>;
}
export function ArticleSection() {
  const { content } = useStorefront(); const [id, setId] = useState('');
  const article = useResource('article:' + id + ':' + (content?.article.find(a => a.id === id)?.version || 0), () => id ? getContentItem(id) : Promise.resolve(null));
  if (!content?.preferences.articles_enabled || !content.article.length) return null;
  return <section className="container section sf-articles">
    <h2>{content.preferences.article_heading}</h2><div className="sf-article-grid">{content.article.map(item => <article className="panel" key={item.id}>
      {item.image_url && <button type="button" className="sf-image-link" onClick={() => setId(item.id)} aria-label={'Baca ' + item.title}><Photo src={item.image_url} alt={item.title} /></button>}
      <h3>{item.title}</h3><p>{item.summary}</p><button type="button" className="text-button" onClick={() => setId(item.id)}>Baca artikel</button>
    </article>)}</div>
    <Modal open={!!id} title={article.data?.title || 'Artikel'} onClose={() => setId('')}><Message loading={article.loading} error={article.error} />
      {article.error && <button className="button secondary" onClick={article.reload}>Coba lagi</button>}
      {article.data ? <article className="sf-body stack">{article.data.image_url && <Photo src={article.data.image_url} alt={article.data.title} />}<p>{article.data.body}</p></article> : !article.loading && !article.error && <p>Artikel tidak tersedia.</p>}
    </Modal>
  </section>;
}
export function FloatingChat() {
  const { content, store } = useStorefront(); const [open, setOpen] = useState(false), [error, setError] = useState('');
  const prefs = content?.preferences; let wa = '';
  try { if (store?.admin_phone && prefs) wa = whatsappUrl(store.admin_phone, prefs.chat_message); } catch { /* Invalid contact stays unavailable. */ }
  const live = !!import.meta.env.VITE_TAWK_PROPERTY_ID && !!import.meta.env.VITE_TAWK_WIDGET_ID;
  if (!prefs?.chat_enabled || (!wa && !live)) return null;
  return <aside className="sf-floating-chat" aria-label="Hubungi toko">
    {open && <div className="panel stack sf-chat-panel"><strong>{prefs.chat_label}</strong><p>{prefs.chat_message}</p>
      {wa && <a className="button" href={wa} target="_blank" rel="noopener noreferrer">Lanjut ke WhatsApp</a>}
      {live && <button className="button secondary" onClick={() => void openLiveChat().catch(e => setError(errorMessage(e)))}>Chat langsung</button>}
      <Message error={error} /><button className="text-button" onClick={() => setOpen(false)}>Tutup</button>
    </div>}
    <button className="button sf-inline" type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}><Outline name="chat" />{prefs.chat_label}</button>
  </aside>;
}
