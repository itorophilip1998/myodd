export function RequestNotice({ notices }: { notices?: string[] }) {
  if (!notices?.length) return null;
  return <details className="result-notice"><summary>{notices[0]}{notices.length > 1 && <span> +{notices.length - 1} notes</span>}</summary>{notices.length > 1 && <ul>{notices.slice(1).map((note, i) => <li key={i}>{note}</li>)}</ul>}</details>;
}
