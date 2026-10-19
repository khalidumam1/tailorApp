/**
 * Help / User Guide (Phase 3 task 3.1) — searchable in-app help compiled
 * from `docs/user-guide/` by `tools/build-guide.mjs`. Lazy-loaded so the
 * guide text never weighs on the entry chunk (bundle budget, F-009).
 */
import { useState, type ReactNode } from 'react';
import { GUIDE_PAGES, type GuidePage } from './guide-content';

function guideInline(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) => (
    index % 2 === 1 ? <strong key={index}>{part}</strong> : <span key={index}>{part}</span>
  ));
}

function GuideBody({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{guideInline(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    if (/^\d+\. /.test(line)) {
      if (!list?.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(line.replace(/^\d+\. /, ''));
    } else if (line.startsWith('- ')) {
      if (list?.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list ??= { ordered: false, items: [] };
      list.items.push(line.slice(2));
    } else {
      flushList();
      if (line.startsWith('### ')) blocks.push(<h4 key={blocks.length}>{guideInline(line.slice(4))}</h4>);
      else if (line.startsWith('## ')) blocks.push(<h3 key={blocks.length}>{guideInline(line.slice(3))}</h3>);
      else if (line.startsWith('# ')) blocks.push(<h2 key={blocks.length}>{guideInline(line.slice(2))}</h2>);
      else if (line.trim()) blocks.push(<p key={blocks.length}>{guideInline(line)}</p>);
    }
  }
  flushList();
  return <div className="guide-body">{blocks}</div>;
}

export function HelpGuide({ audience, topic, onTopicChange }: {
  audience: 'business' | 'platform';
  topic: string;
  onTopicChange: (pageId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const pages = GUIDE_PAGES.filter((page) => page.audience === audience || page.audience === 'all');
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? pages.filter((page) => `${page.title} ${page.keywords} ${page.body}`.toLowerCase().includes(needle))
    : pages;
  const selected: GuidePage = pages.find((page) => page.id === topic && matches.some((match) => match.id === page.id))
    ?? matches[0]
    ?? pages[0];
  return (
    <section className="content-stack">
      <div className="section-heading">
        <div>
          <h2>User Guide</h2>
          <p className="muted">Step-by-step help in simple English, with a Roman Urdu summary on every page. Content version: Phase 3.</p>
        </div>
        <form className="search-form" onSubmit={(event) => event.preventDefault()}>
          <label className="visually-hidden" htmlFor="guide-search">Search the guide</label>
          <input id="guide-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search: order, payment, password…" />
        </form>
      </div>
      <div className="guide-layout">
        <nav className="guide-nav" aria-label="Guide pages">
          {matches.length === 0 && <p className="muted">No page matches “{query}”. Try a module name like Orders or Payments.</p>}
          {matches.map((page) => (
            <button
              key={page.id}
              className={selected?.id === page.id ? 'guide-nav-item active' : 'guide-nav-item'}
              aria-current={selected?.id === page.id ? 'page' : undefined}
              onClick={() => onTopicChange(page.id)}
            >{page.title}</button>
          ))}
        </nav>
        {selected ? (
          <article className="panel guide-article">
            <h2 className="guide-title">{selected.title}</h2>
            <GuideBody body={selected.body} />
          </article>
        ) : <p className="muted">No guide pages available.</p>}
      </div>
    </section>
  );
}

