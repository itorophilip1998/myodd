import { Suspense } from 'react';
import { GenerateForm } from '@/components/GenerateForm';
import { LogoLoader } from '@/components/LogoLoader';

export default function GeneratePage() {
  return (
    <main className="home-workspace">
      <div className="hero">
        <p className="eyebrow"><span className="status-dot" /> SPORTYBET, REIMAGINED</p>
        <h1>Your next code.<br /><span>Your way.</span></h1>
        <p>AI prediction power for SportyBet — sharper picks, stronger codes, your edge.</p>
      </div>
      <Suspense fallback={<LogoLoader label="Loading create" />}>
        <GenerateForm />
      </Suspense>
    </main>
  );
}
