import { Suspense } from 'react';
import { GenerateForm } from '@/components/GenerateForm';
import { LogoLoader } from '@/components/LogoLoader';

export function GenerateWorkspace({ seoContent }: { seoContent?: React.ReactNode }) {
  return (
    <main className="home-workspace">
      <div className="hero">
        <p className="eyebrow"><span className="status-dot" /> SPORTYBET, REIMAGINED</p>
        <h1>Football booking codes.<br /><span>Your way.</span></h1>
        <p>Create SportyBet codes, review your selections, and organize football collections.</p>
      </div>
      <Suspense fallback={<LogoLoader label="Loading create" />}>
        <GenerateForm />
      </Suspense>
      {seoContent}
    </main>
  );
}
