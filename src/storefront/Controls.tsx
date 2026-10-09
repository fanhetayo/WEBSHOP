import { useEffect, useId, useRef, useState, type FocusEvent, type TouchEvent } from 'react';
import type { Product } from '../types';
import { Field } from '../components/UI';

function Combo({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)}>
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></Field>;
}
export function CatalogControls({ search, category, sort, categories, suggestions, loading, onFilter }: {
  search: string; category: string; sort: string; categories: string[]; suggestions: Product[];
  loading: boolean; onFilter: (key: string, value: string) => void;
}) {
  const id = useId();
  return <div className="catalog-filters">
    <div className="search-field"><Field label="Cari produk"><input type="search" maxLength={100} value={search} list={id} onChange={e => onFilter('q', e.target.value)} /></Field></div>
    <datalist id={id}>{!loading && [...new Set(suggestions.map(p => p.title))].map(title => <option key={title} value={title} />)}</datalist>
    <Combo label="Kategori" value={category} options={[{ value: '', label: 'Semua kategori' }, ...categories.map(c => ({ value: c, label: c }))]} onChange={v => onFilter('category', v)} />
    <Combo label="Urutkan" value={sort} options={[{ value: 'newest', label: 'Terbaru' }, { value: 'price_asc', label: 'Harga terendah' }, { value: 'price_desc', label: 'Harga tertinggi' }]} onChange={v => onFilter('sort', v)} />
  </div>;
}
/** Pauses on hover/focus/touch, hidden tab, off-screen content and reduced-motion preference. */
export function useAutoplay(step: () => void, enabled: boolean, seconds: number, resetKey: string) {
  const ref = useRef<HTMLElement>(null), callback = useRef(step);
  callback.current = step;
  const [paused, setPaused] = useState(false), [hover, setHover] = useState(false);
  const [reduced, setReduced] = useState(true), [visible, setVisible] = useState(true), [inView, setInView] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches), visibility = () => setVisible(!document.hidden);
    motion(); visibility(); media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.1 }) : null;
    if (ref.current) observer?.observe(ref.current); if (!observer) setInView(true);
    return () => { observer?.disconnect(); media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, [enabled, resetKey]);
  const running = enabled && !paused && !hover && !reduced && visible && inView;
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => callback.current(), Math.max(3, Math.min(20, seconds)) * 1000); return () => clearInterval(timer); }, [running, seconds, resetKey]);
  return { ref, running, reduced, paused, setPaused, bindings: {
    onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false),
    onFocusCapture: (e: FocusEvent<HTMLElement>) => { if (!(e.target as HTMLElement).closest('[data-autoplay-control]')) setPaused(true); }, onTouchStart: (e: TouchEvent<HTMLElement>) => { if (!(e.target as HTMLElement).closest('[data-autoplay-control]')) setPaused(true); },
  } };
}
export function RotationControls({ next, previous, paused, onToggle, enabled, reduced }: {
  next: () => void; previous: () => void; paused: boolean; onToggle: () => void; enabled: boolean; reduced: boolean;
}) {
  return <div className="sf-rotation actions">
    {enabled && !reduced && <button className="text-button" type="button" data-autoplay-control onClick={onToggle}>{paused ? 'Putar otomatis' : 'Jeda otomatis'}</button>}
    <button className="button secondary" type="button" onClick={previous} aria-label="Geser sebelumnya">Sebelumnya</button>
    <button className="button secondary" type="button" onClick={next} aria-label="Geser berikutnya">Berikutnya</button>
  </div>;
}
