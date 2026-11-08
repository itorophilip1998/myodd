'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="workspace"><h1>This page could not load</h1><p>Your saved codes remain available. Try loading this page again.</p><button className="primary-button" onClick={reset}>Try again</button><a className="text-link" href="/history">Open Codes</a></main>;
}
