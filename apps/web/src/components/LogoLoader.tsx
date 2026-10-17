import { BrandMark } from './BrandMark';
export function LogoLoader({ label = 'Getting your codes ready', detail, step, compact = false }: { label?: string; detail?: string; step?: number; compact?: boolean }) {
  return <div className={`logo-loader ${compact ? 'logo-loader-compact' : ''}`}>
    <div className="logo-loader-scene" aria-hidden="true">
      <div className="logo-loader-halo" /><div className="logo-loader-ring ring-outer" /><div className="logo-loader-ring ring-inner" />
      <div className="logo-loader-path"><i /><i /><i /></div>
      <span className="loader-spark spark-one">✦</span><span className="loader-spark spark-two">＋</span><span className="loader-spark spark-three">✧</span>
      <div className="loader-ticket ticket-one"><span>✓</span><i /><i /><small>CHECKING</small></div>
      <div className="loader-ticket ticket-two"><span>◇</span><i /><i /><small>BUILDING</small></div>
      <div className="logo-loader-core"><BrandMark className="loader-brand" /><span className="loader-logo-shine" /></div>
      {step !== undefined && <span className="loader-checkpoint">CHECKPOINT <b>{String(Math.min(5, step)).padStart(2, '0')}</b> / 05</span>}
    </div>
    <p className="logo-loader-label" role="status">{label}<span className="loader-dots" aria-hidden="true"><i /><i /><i /></span></p>
    {detail && <p className="logo-loader-detail">{detail}</p>}
  </div>;
}
