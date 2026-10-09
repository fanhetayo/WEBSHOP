import { useEffect, useState, type FormEvent } from 'react';
import { Field, Message, Modal, Pagination, Photo } from '../components/UI';
import { getMethods, getProducts, uploadImage } from '../lib/api';
import { errorMessage } from '../lib/domain';
import { useResource } from '../lib/useResource';
import { getContent, getContentItem, getPreferences, getProductsByIds, saveContent, savePreferences } from './api';
import type { ContentDraft, ContentItem, ContentKind, StorefrontPreferences } from './model';

const tabs: [ContentKind, string][] = [['banner', 'Banner'], ['article', 'Artikel'], ['trust', 'Informasi layanan'], ['payment', 'Logo pembayaran']];
const empty = (kind: ContentKind): ContentDraft => ({ kind, title: '', summary: '', body: '', image_url: '', link_url: '', button_label: '', payment_method_id: null, sort_order: 0, published: false });
export default function StorefrontContent() {
  const [kind, setKind] = useState<ContentKind>('banner'), [page, setPage] = useState(0);
  const [preferences, setPreferences] = useState<StorefrontPreferences | null>(null);
  const [draft, setDraft] = useState<ContentDraft | null>(null), [original, setOriginal] = useState<ContentItem>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const settings = useResource('storefront-preferences-admin', getPreferences);
  const listing = useResource('storefront-admin:' + kind + ':' + page, () => getContent(kind, true, page));
  const methods = useResource('storefront-methods-admin', () => getMethods(true));
  useEffect(() => { if (settings.data) setPreferences(settings.data); }, [settings.data]);
  async function edit(id: string) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const item = await getContentItem(id, true);
      if (!item) throw new Error('Konten tidak ditemukan.');
      setOriginal(item); setDraft(item);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await saveContent(draft, original); setDraft(null); listing.reload(); setMessage('Konten berhasil disimpan.'); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (!preferences || busy) return;
    setBusy(true); setError(''); setMessage('');
    try { setPreferences(await savePreferences(preferences)); setMessage('Pengaturan tampilan berhasil disimpan.'); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file || !draft || busy) return;
    setBusy(true); setError('');
    try { const image_url = await uploadImage(file, 'storefront'); setDraft(value => value ? { ...value, image_url } : value); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="stack sf-cms">
    <h1>Konten toko</h1>
    <Message loading={settings.loading || listing.loading || methods.loading} error={error || settings.error || listing.error || methods.error} success={message} />
    {(settings.error || listing.error || methods.error) && <button className="button secondary" disabled={busy} onClick={() => { settings.reload(); listing.reload(); methods.reload(); }}>Muat ulang</button>}
    {preferences && <form className="panel stack" onSubmit={saveSettings}>
      <h2>Pengaturan tampilan</h2>
      <fieldset className="stack" disabled={busy}>
        {(['banner_autoplay', 'product_carousel', 'product_autoplay', 'articles_enabled', 'payments_enabled', 'trust_enabled', 'wishlist_enabled', 'quick_view_enabled', 'chat_enabled'] as const).map(key => <label className="check" key={key}><input type="checkbox" checked={preferences[key]} onChange={e => setPreferences({ ...preferences, [key]: e.target.checked })} />{{ banner_autoplay: 'Autoplay banner', product_carousel: 'Slider produk', product_autoplay: 'Autoplay produk', articles_enabled: 'Artikel', payments_enabled: 'Logo pembayaran', trust_enabled: 'Informasi layanan', wishlist_enabled: 'Wishlist', quick_view_enabled: 'Lihat cepat', chat_enabled: 'Chat toko' }[key]}</label>)}
        {(['banner_seconds', 'product_seconds'] as const).map(key => <Field key={key} label={key === 'banner_seconds' ? 'Jeda banner (detik)' : 'Jeda produk (detik)'}><input required type="number" min={3} max={20} step={1} value={preferences[key]} onChange={e => setPreferences({ ...preferences, [key]: Number(e.target.value) })} /></Field>)}
        {(['product_heading', 'article_heading', 'payment_heading', 'chat_label'] as const).map(key => <Field key={key} label={{ product_heading: 'Judul slider produk', article_heading: 'Judul artikel', payment_heading: 'Judul pembayaran', chat_label: 'Label chat' }[key]}><input required maxLength={160} value={preferences[key]} onChange={e => setPreferences({ ...preferences, [key]: e.target.value })} /></Field>)}
        <Field label="Pesan chat"><textarea maxLength={700} value={preferences.chat_message} onChange={e => setPreferences({ ...preferences, chat_message: e.target.value })} /></Field>
        <Field label="Teks promosi"><textarea maxLength={500} value={preferences.promotion_text} onChange={e => setPreferences({ ...preferences, promotion_text: e.target.value })} /></Field>
        <FeaturedPicker ids={preferences.featured_ids} onChange={featured_ids => setPreferences({ ...preferences, featured_ids })} />
      </fieldset>
      <button className="button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pengaturan tampilan'}</button>
    </form>}
    <div className="panel stack">
      <div className="actions">{tabs.map(([key,label]) => <button disabled={busy} key={key} type="button" className={'button ' + (kind === key ? '' : 'secondary')} onClick={() => { setKind(key); setPage(0); }}>{label}</button>)}</div>
      <div className="section-heading"><h2>{tabs.find(t => t[0] === kind)?.[1]}</h2><button disabled={busy} type="button" className="button" onClick={() => { setOriginal(undefined); setDraft(empty(kind)); setError(''); setMessage(''); }}>Tambah konten</button></div>
      <p className="muted">Urutan kecil tampil lebih awal. Publikasi dapat dimatikan tanpa menghapus data. Banner/pembayaran/informasi: maksimal 24 item tampil; artikel: 6 terbaru sesuai urutan.</p>
      <div className="stack">{listing.data?.rows.map(row => <div className="sf-cms-row" key={row.id}><div><strong>{row.title}</strong><p className="muted">{row.published ? 'Dipublikasikan' : 'Draft'} · Urutan {row.sort_order}</p></div><button disabled={busy} type="button" className="button secondary" onClick={() => edit(row.id)}>Ubah</button></div>)}</div>
      {!listing.loading && !listing.error && !listing.data?.rows.length && <p>Belum ada konten.</p>}
      <Pagination page={page} size={20} count={listing.data?.count || 0} disabled={listing.loading || busy} onChange={setPage} />
    </div>
    <Modal open={!!draft} title={original ? 'Ubah konten' : 'Tambah konten'} busy={busy} onClose={() => setDraft(null)}>
      {draft && <form className="stack sf-cms" onSubmit={save}><fieldset className="stack" disabled={busy}>
        <Field label="Judul / nama"><input required maxLength={160} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></Field>
        <Field label={draft.kind === 'trust' ? 'Kebijakan yang benar-benar berlaku' : 'Ringkasan'}><textarea rows={3} maxLength={700} value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} /></Field>
        {draft.kind === 'trust' && <p className="message">Jangan menampilkan badge sertifikasi, jaminan uang kembali, pengiriman gratis, atau klaim lain tanpa kebijakan nyata dan bukti yang sesuai.</p>}
        {draft.kind === 'article' && <Field label="Isi artikel (teks biasa, bukan HTML)"><textarea rows={12} maxLength={30000} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></Field>}
        {draft.kind !== 'trust' && <>
          {draft.image_url && <Photo src={draft.image_url} alt={draft.title || 'Pratinjau'} className="sf-cms-image" />}
          <Field label={draft.kind === 'payment' ? 'Unggah logo resmi milik penyedia pembayaran' : 'Unggah gambar'}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></Field>
          <Field label="URL gambar HTTPS"><input type="url" maxLength={2000} value={draft.image_url} onChange={e => setDraft({ ...draft, image_url: e.target.value })} /></Field>
        </>}
        {draft.kind === 'payment' && <Field label="Metode bayar yang diwakili logo ini"><select required value={draft.payment_method_id || ''} onChange={e => setDraft({ ...draft, payment_method_id: e.target.value || null })}><option value="">Pilih metode</option>{methods.data?.map(m => <option key={m.id} value={m.id}>{m.name}{m.is_active ? '' : ' (nonaktif)'}</option>)}</select></Field>}
        {['banner','trust'].includes(draft.kind) && <Field label="Tautan tujuan" hint="Gunakan #catalog, /?category=Nama, atau alamat HTTPS."><input maxLength={2000} value={draft.link_url} onChange={e => setDraft({ ...draft, link_url: e.target.value })} /></Field>}
        {draft.kind === 'banner' && <Field label="Teks tombol banner"><input maxLength={60} value={draft.button_label} onChange={e => setDraft({ ...draft, button_label: e.target.value })} /></Field>}
        <Field label="Urutan"><input required type="number" step={1} min={-100000} max={100000} value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></Field>
        <label className="check"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} />Publikasikan di toko</label>
      </fieldset><Message error={error} /><button className="button" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan konten'}</button></form>}
    </Modal>
  </section>;
}
function FeaturedPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const results = useResource('featured-picker:' + search + ':' + page, signal => getProducts({ page, search, category: '', sort: 'newest' }, signal));
  const selected = useResource('featured-selected:' + ids.join(','), () => getProductsByIds(ids));
  const move = (i: number, delta: number) => { const copy = [...ids]; [copy[i],copy[i + delta]] = [copy[i + delta],copy[i]]; onChange(copy); };
  return <section className="stack"><h3>Produk pada slider</h3><p className="muted">Kosong = 16 produk terbaru. Pilih dan urutkan maksimal 24 produk; katalog dan pagination utama tidak berubah.</p>
    <Field label="Cari produk untuk slider"><input type="search" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></Field>
    <Message loading={results.loading} error={results.error || selected.error} />
    <div className="sf-picker">{results.data?.rows.map(p => <label className="check" key={p.id}><input type="checkbox" checked={ids.includes(p.id)} disabled={!ids.includes(p.id) && ids.length >= 24} onChange={e => onChange(e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id))} />{p.title}</label>)}</div>
    <Pagination page={page} size={16} count={results.data?.count || 0} disabled={results.loading} onChange={setPage} />
    <ol className="stack">{ids.map((id,i) => <li key={id} className="sf-cms-row"><span>{selected.data?.find(p => p.id === id)?.title || 'Produk tidak aktif / ' + id}</span><div className="actions"><button className="text-button" type="button" disabled={i === 0} onClick={() => move(i,-1)}>Naik</button><button className="text-button" type="button" disabled={i === ids.length-1} onClick={() => move(i,1)}>Turun</button><button className="text-button" type="button" onClick={() => onChange(ids.filter(x => x !== id))}>Hapus</button></div></li>)}</ol>
  </section>;
}
