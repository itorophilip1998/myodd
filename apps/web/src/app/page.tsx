import { Suspense } from 'react';
import { GenerateForm } from '@/components/GenerateForm';
import { LogoLoader } from '@/components/LogoLoader';

export default function HomePage() {
  return (
    <main className="home-workspace">
      <div className="hero">
        <p className="eyebrow"><span className="status-dot" /> SPORTYBET, REIMAGINED</p>
        <h1>Your next code.<br /><span>Your way.</span></h1>
        <p>Your codes. Your conversation.<br className="hidden sm:block" /> Set options, pick a date, generate.</p>
      </div>
      <Suspense fallback={<LogoLoader label="Loading create" />}>
        <GenerateForm />
      </Suspense>
    </main>
  );
}
