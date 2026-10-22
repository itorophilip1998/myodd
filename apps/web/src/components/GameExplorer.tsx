'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { exactOdds, formatOdds, matchesPredictionMarket, PREDICTION_MARKETS, type PredictionMarket } from '@myodd/shared';
import { exploreApi, type ExplorerGame } from '@/lib/api';
import {
  pickKey,
  readPredictionBook,
  removePredictionBookPick,
  upsertPredictionBookPick,
  type PredictionBookPick,
  writePredictionBook,
} from '@/lib/prediction-book';
import { useToast } from './ToastProvider';

const STATUS: Record<string, string> = { H1: 'First half', H2: 'Second half', HT: 'Half-time', ET: 'Extra time', BT: 'Break', LIVE: 'Live' };

function toBookPick(game: ExplorerGame, p: NonNullable<ExplorerGame['predictions']>[number]): PredictionBookPick {
  return {
    eventId: game.eventId,
    marketId: p.marketId,
    outcomeId: p.outcomeId,
    specifier: p.specifier ?? '',
    odds: p.odds,
    marketName: p.marketName,
    selectionName: p.selectionName,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    league: game.league || game.categoryName,
    kickoffAt: game.kickoffAt,
    probability: p.probability,
  };
}

export function GameExplorer({ kind }: { kind: 'live' | 'predictions' }) {
  const live = kind === 'live';
  const router = useRouter();
  const toast = useToast();
  const told = useRef<string | null>(null);
  const [search, setSearch] = useState(''); const [league, setLeague] = useState(''); const [page, setPage] = useState(1);
  const [market, setMarket] = useState<PredictionMarket>('all'); const [sort, setSort] = useState('kickoff'); const [clock, setClock] = useState(Date.now());
  const [book, setBook] = useState<PredictionBookPick[]>([]);
  const query = useQuery({ queryKey: ['explore', kind, live ? '' : market], queryFn: () => live ? exploreApi.live() : exploreApi.predictions({ market }),
    refetchInterval: live ? 15000 : 90000, retry: 1, placeholderData: keepPreviousData });
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 5000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (live) return;
    setBook(readPredictionBook());
    const sync = () => setBook(readPredictionBook());
    window.addEventListener('storage', sync);
    window.addEventListener('myodd:prediction-book', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('myodd:prediction-book', sync);
    };
  }, [live]);
  const expiredSnapshot = live && !!query.data && clock - Date.parse(query.data.observedAt) > 45000;
  useEffect(() => {
    const message = !query.data && query.error
      ? (query.error as Error).message
      : expiredSnapshot
        ? 'Live feed refresh is delayed. Showing the last known games until SportyBet updates.'
        : query.isError && query.data
          ? 'Could not refresh right now. Keeping the last loaded games on screen.'
          : null;
    if (!message) return;
    if (told.current === message) return;
    told.current = message;
    toast(message, { sticky: !query.data || !!query.error });
  }, [query.error, query.data, query.isError, expiredSnapshot, toast]);
  const games = useMemo(() => (query.data?.games ?? []).filter(g => live || Date.parse(g.kickoffAt) > clock), [query.data, live, clock]);
  const leagues = [...new Set(games.map(g => g.league))].sort();
  function choices(game: ExplorerGame) {
    return (game.predictions ?? []).filter(p => matchesPredictionMarket(p, market))
      .sort((a, b) => b.probability - a.probability);
  }
  const filtered = games.filter(g => (!league || g.league === league) && `${g.homeTeam} ${g.awayTeam} ${g.league} ${g.categoryName}`.toLowerCase().includes(search.toLowerCase()) && (live || choices(g).length));
  filtered.sort((a, b) => !live && sort === 'estimate' ? (choices(b)[0]?.probability ?? 0) - (choices(a)[0]?.probability ?? 0) : Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
  const pages = Math.max(1, Math.ceil(filtered.length / 12)); const current = Math.min(page, pages); const visible = filtered.slice((current - 1) * 12, current * 12);
  const timestamp = query.data ? new Date(query.data.observedAt).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  function addPick(game: ExplorerGame, p: NonNullable<ExplorerGame['predictions']>[number]) {
    setBook(upsertPredictionBookPick(toBookPick(game, p)));
  }
  function removePick(eventId: string) {
    setBook(removePredictionBookPick(eventId));
  }
  function submitBook() {
    if (!book.length) return;
    writePredictionBook(book);
    router.push('/generate?book=1');
  }

  return <main className={`workspace explore-workspace${!live && book.length ? ' has-prediction-book' : ''}`}><header className="explore-hero"><div><p className="eyebrow">{live ? 'ON THE PITCH' : 'BEFORE KICKOFF'}</p><h1>{live ? <>The game. <em>Right now.</em></> : <>A clearer view. <em>Every game.</em></>}</h1><p>{live ? 'Find live football by team or league. Scores and the reported match clock refresh automatically.' : 'Explore upcoming matches, compare estimated outcomes, and build a prediction book to generate on Create.'}</p></div><span className={`explore-badge ${live ? 'is-live' : ''}`}>{live ? '● LIVE' : '◇ MODEL INSIGHTS'}</span></header>
    <div className="explore-toolbar"><label className="explore-search"><span aria-hidden>⌕</span><input type="search" aria-label={live ? 'Search live games' : 'Search predictions'} placeholder="Search a team, league or country…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><select aria-label="Filter league" value={league} onChange={e => { setLeague(e.target.value); setPage(1); }}><option value="">All leagues</option>{leagues.map(l => <option key={l}>{l}</option>)}</select>{!live && <><select aria-label="Prediction market" value={market} onChange={e => { setMarket(e.target.value as PredictionMarket); setPage(1); }}>{PREDICTION_MARKETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select aria-label="Sort predictions" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="kickoff">Soonest kickoff</option><option value="estimate">Highest estimate</option></select></>}<button className="explore-refresh" disabled={query.isFetching} onClick={() => void query.refetch()} aria-label="Refresh games">{query.isFetching ? 'Updating…' : '↻ Refresh'}</button></div>
    {!live && <div className="prediction-market-options" role="group" aria-label="Prediction types">{PREDICTION_MARKETS.map(option => <button key={option.value} aria-pressed={market === option.value} onClick={() => { setMarket(option.value); setPage(1); }}>{option.label}</button>)}</div>}
    <div className="explore-meta"><span>{filtered.length} {live ? 'live games' : 'upcoming matches'}{search || league ? ' found' : ' in this feed'}{!live && book.length ? ` · ${book.length} in book` : ''}</span><span>{timestamp ? `Snapshot ${timestamp} WAT` : 'Connecting to SportyBet…'}</span></div>
    {query.isLoading && <div className="game-skeletons" role="status" aria-label="Loading games">{Array.from({ length: 6 }, (_, i) => <div key={i}><span /><span /><span /></div>)}</div>}
    {!query.isLoading && <div className={`explore-grid${expiredSnapshot ? ' is-stale' : ''}`}>{visible.map(game => <article className="game-card" key={game.eventId}><div className="game-league"><span>{game.league || game.categoryName}</span>{live ? <span className="live-match-status">{STATUS[game.liveStatus ?? ''] ?? game.liveStatus ?? 'Live'}</span> : <time dateTime={game.kickoffAt}>{new Date(game.kickoffAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} WAT</time>}</div><div className="game-teams"><div><strong>{game.homeTeam}</strong><strong>{game.awayTeam}</strong></div>{live && <div className="game-score"><b>{game.score?.split(' : ')[0] ?? '–'}</b><b>{game.score?.split(' : ')[1] ?? '–'}</b></div>}</div>{live ? <div className="game-live-footer"><span className="status-dot" />{game.clock ? `Reported clock ${game.clock}` : 'Clock unavailable'}<span>SportyBet</span></div> : <PredictionDetails game={game} choices={choices(game)} market={market} book={book} onAdd={addPick} onRemove={removePick} />}</article>)}</div>}
    {!query.isLoading && !filtered.length && <div className="explore-empty"><span>⌕</span><h2>{!live && market !== 'all' ? 'No available ' + PREDICTION_MARKETS.find(m => m.value === market)?.label.toLowerCase() + ' predictions' : search || league ? 'No matching games' : live ? 'No live games in this feed right now' : 'No upcoming predictions available'}</h2><p>{!live && market !== 'all' ? 'This feed has no priced outcomes for your selected type. Try another type or refresh; we keep your selection instead of substituting other markets.' : search || league ? 'Try another team or reset your filters.' : 'Refresh shortly to check for new matches.'}</p>{(search || league || (!live && market !== 'all')) && <button onClick={() => { setSearch(''); setLeague(''); setMarket('all'); setPage(1); }}>Clear filters</button>}</div>}
    {filtered.length > 12 && <nav className="result-pagination" aria-label="Game pages"><span>Page {current} of {pages}</span><div><button disabled={current === 1} onClick={() => setPage(current - 1)}>← Previous</button><button disabled={current === pages} onClick={() => setPage(current + 1)}>Next →</button></div></nav>}
    {!live && <p className="prediction-basis">Estimates use the Python prediction service. Price-based models reflect bookmaker odds; trained Poisson estimates appear only when a matching trained model is available. These estimates are not guarantees. Search covers the loaded upcoming feed; detailed alternate markets are loaded for up to 24 matches. “None” applies no market filter. Corners and other specialist markets appear only when available and use price-based estimates unless a matching trained model exists.</p>}
    {!live && book.length > 0 && (
      <div className="prediction-book-bar" role="region" aria-label="Prediction book">
        <div className="prediction-book-bar-copy">
          <strong>{book.length} pick{book.length === 1 ? '' : 's'} in book</strong>
          <span>{book.map(p => `${p.homeTeam.split(' ').slice(-1)[0]} ${p.selectionName}`).slice(0, 4).join(' · ')}{book.length > 4 ? ` · +${book.length - 4}` : ''}</span>
        </div>
        <div className="prediction-book-bar-actions">
          <button type="button" className="quiet-button" onClick={() => { writePredictionBook([]); setBook([]); }}>Clear</button>
          <button type="button" className="primary-button" onClick={submitBook}>Submit book →</button>
        </div>
      </div>
    )}
  </main>;
}

function PredictionDetails({
  game, choices, market, book, onAdd, onRemove,
}: {
  game: ExplorerGame;
  choices: NonNullable<ExplorerGame['predictions']>;
  market: PredictionMarket;
  book: PredictionBookPick[];
  onAdd: (game: ExplorerGame, p: NonNullable<ExplorerGame['predictions']>[number]) => void;
  onRemove: (eventId: string) => void;
}) {
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean; width: number } | null>(null);
  const [limit, setLimit] = useState(50);
  useEffect(() => { setLimit(50); setOpen(false); }, [market, game.eventId]);

  const total = game.predictionCount ?? choices.length;
  const more = useQuery({
    queryKey: ['prediction-outcomes', game.eventId, market, limit],
    enabled: open && limit > 50 && total > choices.length,
    queryFn: () => exploreApi.predictions({ eventId: game.eventId, market, limit }),
    staleTime: 60000,
  });
  useEffect(() => {
    if (!more.error) return;
    toast('Could not load more outcomes.', { sticky: true });
  }, [more.error, toast]);
  const rows = more.data?.games[0]?.predictions ?? choices;
  const top = choices[0];
  if (!top) return <p>No available estimates</p>;
  const trained = top.modelVersion.startsWith('poisson');
  const booked = book.find(p => p.eventId === game.eventId);
  const topInBook = booked && pickKey(booked) === pickKey({ eventId: game.eventId, marketId: top.marketId, outcomeId: top.outcomeId, specifier: top.specifier ?? '' });

  useLayoutEffect(() => {
    if (!open || !root.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const rect = root.current!.getBoundingClientRect();
      const width = Math.min(320, Math.max(220, rect.width));
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const estimatedHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      const top = openUp ? rect.top - 6 : rect.bottom + 6;
      setPos({ top, left, openUp, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, rows.length]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (root.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const dropdown = open && pos && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panel}
        className="outcome-compare-panel"
        role="listbox"
        aria-label="Compare outcomes"
        style={{
          top: pos.top,
          left: pos.left,
          width: pos.width,
          transform: pos.openUp ? 'translateY(-100%)' : undefined,
        }}
      >
        <div className="outcome-compare-scroll">
          {rows.slice(0, limit).map(p => {
            const inBook = booked && pickKey(booked) === pickKey({
              eventId: game.eventId,
              marketId: p.marketId,
              outcomeId: p.outcomeId,
              specifier: p.specifier ?? '',
            });
            return (
              <button
                type="button"
                role="option"
                aria-selected={!!inBook}
                className={`outcome-compare-item${inBook ? ' is-booked' : ''}`}
                key={`${p.marketId}:${p.outcomeId}:${p.specifier ?? ''}:${p.marketName}`}
                onClick={() => {
                  if (inBook) onRemove(game.eventId);
                  else onAdd(game, p);
                  setOpen(false);
                }}
              >
                <span className="outcome-compare-copy">
                  <strong>{p.selectionName}</strong>
                  <small>{p.marketName}</small>
                </span>
                <span className="outcome-compare-meta">
                  <b>{(p.probability * 100).toFixed(1)}%</b>
                  <small>{inBook ? 'In book' : 'Add'}</small>
                </span>
              </button>
            );
          })}
        </div>
        {total > rows.length && limit < 5000 && (
          <button
            type="button"
            className="outcome-compare-more"
            disabled={more.isFetching}
            onClick={() => setLimit(n => Math.min(n + 50, 5000))}
          >
            {more.isFetching ? 'Loading…' : `More · ${rows.length}/${total}`}
          </button>
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="game-prediction">
      <div className="prediction-pick">
        <div>
          <small>{top.marketName}</small>
          <strong>{top.selectionName}</strong>
        </div>
        <div>
          <b>{(top.probability * 100).toFixed(1).replace(/\.0$/, '')}%</b>
          <small>estimated</small>
        </div>
      </div>
      <div className="prediction-price">
        <span title={exactOdds(top.odds!)}>Odds {formatOdds(top.odds!)}</span>
        <span>{trained ? 'Trained goal model' : 'Price-based estimate'}</span>
      </div>
      <div className="prediction-book-actions" ref={root}>
        {topInBook ? (
          <button type="button" className="prediction-book-btn is-compact is-in-book" onClick={() => onRemove(game.eventId)}>
            In book
          </button>
        ) : (
          <button type="button" className="prediction-book-btn is-compact" onClick={() => onAdd(game, top)}>
            {booked ? 'Replace' : 'Add to book'}
          </button>
        )}
        <button
          type="button"
          className={`outcome-compare-link${open ? ' is-open' : ''}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen(v => !v)}
        >
          Compare outcomes ({total})
        </button>
      </div>
      {dropdown}
    </div>
  );
}

