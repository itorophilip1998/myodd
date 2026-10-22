'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MARKET_REGISTRY } from '@myodd/shared';

export function MarketPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ['market-capabilities'], queryFn: () => api.markets(), staleTime: 30_000, enabled: expanded });
  useEffect(() => {
    if (expanded) content.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [expanded, query.data]);
  const options = query.data?.options ?? MARKET_REGISTRY.map(item => ({ ...item, available: false }));
  const categories = [...new Set(options.map(item => item.category))];
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id].slice(0, 100));
  return <section className="market-picker" aria-label="Markets">
    <button type="button" className="market-expand" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}><span><strong>Markets</strong><small>{selected.length ? `${selected.length} selected` : 'Optional · use your prompt by default'}</small></span><span aria-hidden>{expanded ? '−' : '+'}</span></button>
    {expanded && <div ref={content} id={id} className="market-picker-content">
    <input type="search" aria-label="Search markets" placeholder="Search markets" value={search} onChange={e => setSearch(e.target.value)} />
    {query.isPending && <p role="status">Checking provider markets…</p>}
    {query.isError && <p role="alert">Market availability could not load. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
    <div className="market-chips">{selected.map(id => <button type="button" key={id} onClick={() => toggle(id)} aria-label={`Remove ${options.find(item => item.id === id)?.label ?? 'unavailable market'}`}>{options.find(item => item.id === id)?.label ?? 'Unavailable market'} ×</button>)}</div>
    {!!selected.length && <button type="button" onClick={() => onChange([])}>Clear all</button>}
    {!query.isPending && !query.isError && !options.some(item => `${item.label} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase())) && <p role="status">No matching markets. Try another search.</p>}
    <div className="market-options" role="region" aria-label="Market choices" tabIndex={0}>{categories.map(category => {
      const items = options.filter(item => item.category === category && `${item.label} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase()));
      if (!items.length) return null;
      return <fieldset key={category}><legend>{category}</legend>
        <div className="market-category-actions"><button type="button" disabled={!items.some(item => item.available && !selected.includes(item.id))} onClick={() => onChange([...new Set([...selected, ...items.filter(item => item.available).map(item => item.id)])].slice(0, 100))}>Select all</button>
        <button type="button" onClick={() => onChange(selected.filter(id => !options.some(item => item.category === category && item.id === id)))} disabled={!items.some(item => selected.includes(item.id))}>Clear</button></div>
        {items.map(item => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={!item.available && !selected.includes(item.id)} onChange={() => toggle(item.id)} /><span>{item.label}</span>{!item.available && <small>Unavailable</small>}</label>)}
      </fieldset>;
    })}</div>

    </div>}
  </section>;
}
