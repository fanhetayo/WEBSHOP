import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Message, Pagination, Photo } from '../components/UI';
import { useResource } from '../lib/useResource';
import { getArticle, getContent } from './api';

export function ArticleDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</time>;
}
export default function Articles() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(0, Math.min(100000, Math.floor(Number(params.get('page'))) || 0));
  const result = useResource('articles:' + (slug || page), async signal => slug
    ? { article: await getArticle(slug, signal), listing: null }
    : { article: null, listing: await getContent('article', false, page, signal) });
  const article = result.data?.article;
  useEffect(() => {
    document.title = article ? article.title + ' | Artikel' : 'Artikel';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [slug, page, article?.title]);
  return <section className="container section sf-articles">
    <Link className="text-button back-link" to={slug ? '/artikel' : '/'}>{slug ? 'Semua artikel' : 'Kembali ke katalog'}</Link>
    <Message loading={result.loading} error={result.error} />
    {result.error && <button className="button secondary" onClick={result.reload}>Coba lagi</button>}
    {!result.loading && !result.error && (slug ? article ? <article className="sf-body stack">
      <h1>{article.title}</h1><ArticleDate value={article.created_at} />
      {article.image_url && <Photo src={article.image_url} alt={article.title} />}
      <p>{article.body}</p>
      <a className="text-button" href={'/artikel/' + article.slug}>Tautan permanen artikel</a>
    </article> : <><h1>Artikel tidak ditemukan</h1><p>Artikel tidak tersedia atau belum dipublikasikan.</p></> : <>
      <h1>Artikel</h1>
      {!result.data?.listing?.rows.length && <p>Belum ada artikel pada halaman ini.</p>}
      <div className="sf-article-grid">{result.data?.listing?.rows.map(item => <article className="panel" key={item.id}>
        {item.image_url && <Link to={'/artikel/' + item.slug}><Photo src={item.image_url} alt={item.title} /></Link>}
        <h2><Link to={'/artikel/' + item.slug}>{item.title}</Link></h2>
        <ArticleDate value={item.created_at} /><p>{item.summary}</p>
        <Link className="text-button" to={'/artikel/' + item.slug}>Baca artikel</Link>
      </article>)}</div>
      <Pagination page={page} size={6} count={result.data?.listing?.count || 0} disabled={result.loading} onChange={n => setParams(n ? { page: String(n) } : {})} />
    </>)}
  </section>;
}