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
