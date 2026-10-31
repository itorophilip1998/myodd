'use client';
import { useQuery } from '@tanstack/react-query';
import { api, type PredictionPerformanceReport } from '@/lib/api';

const percent = (value: number | null) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const score = (value: number | null) => value == null ? '—' : value.toFixed(3);
export function PredictionPerformance() {
  const query = useQuery({ queryKey: ['prediction-performance'], queryFn: api.predictionPerformance, refetchInterval: 60000, retry: 1 });
  const data = query.data;
  return <details className="prediction-performance">
    <summary>Prediction performance <span>{data?.overall ? `${data.overall.samples} verified selections` : 'Verified results'}</span></summary>
    {query.isPending ? <p>Loading verified results…</p> : query.isError || !data?.overall
      ? <p>Performance is temporarily unavailable. Predictions remain available.</p>
      : <PerformanceDetails data={data} />}
  </details>;
}
function PerformanceDetails({ data }: { data: PredictionPerformanceReport }) {
  const active = data.learning.active;
  const learningMessage = data.learning.state === 'unavailable' ? 'Learning status is temporarily unavailable.'
    : data.learning.state === 'degraded' ? 'Base predictions are active while learning storage is unavailable.'
    : active ? `Learning model: ${active.version}.` : 'Collecting verified outcomes before activating a learned model.';
  return <>
    <p>Results from generated tickets in the last 90 days. Repeated selections count once in prediction scores. Pending, void and unverified results do not train the model.</p>
    <dl className="performance-metrics">
      <div><dt>Verified selections</dt><dd>{data.overall.samples}</dd></div>
      <div><dt>Selection win rate</dt><dd>{percent(data.overall.winRate)}</dd></div>
      <div><dt>Ticket win rate</dt><dd>{percent(data.tickets.winRate)}</dd></div>
      <div><dt>Probability error</dt><dd>{score(data.overall.brier)}</dd></div>
      <div><dt>Baseline error</dt><dd>{score(data.baseline.brier)}</dd></div>
    </dl>
    <p>Probability error is the Brier score; lower is better. Selection win rate is different from the chance of a whole ticket winning.</p>
    <p>{learningMessage} {data.learning.lastEvaluation?.reason ?? ''}</p>
    <p>{data.tickets.won} won tickets · {data.tickets.lost} lost · {data.tickets.void} void · {data.tickets.awaitingVerification} awaiting full verification.</p>
    {data.byMode.length > 0 && <div className="performance-table"><table><caption>Results by mode</caption><thead><tr><th>Mode</th><th>Selections</th><th>Win rate</th><th>Probability error</th></tr></thead><tbody>{data.byMode.map(row => <tr key={row.name}><td>{row.name.replaceAll('_', ' ')}</td><td>{row.samples}</td><td>{percent(row.winRate)}</td><td>{score(row.brier)}</td></tr>)}</tbody></table></div>}
    {data.byModel.length > 0 && <div className="performance-table"><table><caption>Results by model version</caption><thead><tr><th>Model</th><th>Selections</th><th>Probability error</th></tr></thead><tbody>{data.byModel.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.samples}</td><td>{score(row.brier)}</td></tr>)}</tbody></table></div>}
  </>;
}
