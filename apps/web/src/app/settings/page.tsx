'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BackLink } from '@/components/BackButton';
import { SettingsForm } from '@/components/SettingsForm';
import { useAccountSession } from '@/components/AccountSession';
import { LogoLoader } from '@/components/LogoLoader';

export default function SettingsPage() {
  const session = useAccountSession();
  const router = useRouter();

  useEffect(() => {
    if (session.configured && !session.signedIn) {
      router.replace('/sign-in?redirect_url=/settings');
    }
  }, [session.configured, session.signedIn, router]);

  if (!session.configured || !session.signedIn) {
    return (
      <main className="workspace settings-workspace">
        <LogoLoader compact label="Opening settings" />
      </main>
    );
  }

  return (
    <main className="workspace settings-workspace">
      <header className="settings-page-head">
        <div>
          <p className="eyebrow">SYSTEM</p>
          <h1>Settings</h1>
          <p>Defaults for Create, plus sound cues. Changes save as you edit.</p>
        </div>
        <BackLink href="/" label="Create" className="outline-button" />
      </header>
      <SettingsForm />
    </main>
  );
}
