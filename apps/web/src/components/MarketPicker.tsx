'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MARKET_REGISTRY } from '@myodd/shared';

export function MarketPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['market-capabilities'], queryFn: () => api.markets(), staleTime: 30_000 });
  const options = query.data?.options ?? MARKET_REGISTRY.map(item => ({ ...item, available: false }));
  const categories = [...new Set(options.map(item => item.category))];
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id].slice(0, 100));
  return <details className="market-picker"><summary>Markets {selected.length ? `(${selected.length} selected)` : '— from prompt'}</summary>
    <input type="search" aria-label="Search markets" placeholder="Search markets" value={search} onChange={e => setSearch(e.target.value)} />
    {query.isPending && <p role="status">Checking provider markets…</p>}
    {query.isError && <p role="alert">Market availability could not load. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
    <div className="market-chips">{selected.map(id => <button type="button" key={id} onClick={() => toggle(id)} aria-label={`Remove ${options.find(item => item.id === id)?.label ?? 'unavailable market'}`}>{options.find(item => item.id === id)?.label ?? 'Unavailable market'} ×</button>)}</div>
    {!!selected.length && <button type="button" onClick={() => onChange([])}>Clear all</button>}
    <div className="market-options">{categories.map(category => {
      const items = options.filter(item => item.category === category && item.label.toLowerCase().includes(search.toLowerCase()));
      if (!items.length) return null;
      return <fieldset key={category}><legend>{category}</legend>
        <button type="button" onClick={() => onChange([...new Set([...selected, ...items.filter(item => item.available).map(item => item.id)])].slice(0, 100))}>Select all</button>
        <button type="button" onClick={() => onChange(selected.filter(id => !options.some(item => item.category === category && item.id === id)))}>Clear category</button>
        {items.map(item => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={!item.available && !selected.includes(item.id)} onChange={() => toggle(item.id)} />{item.label}{!item.available && ' · unavailable'}</label>)}
      </fieldset>;
    })}</div>
    <p>Availability is checked again before creating codes. Unsupported interval markets are never substituted.</p>
  </details>;
}
