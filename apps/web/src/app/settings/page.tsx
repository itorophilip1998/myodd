'use client';

import { BackLink } from '@/components/BackButton';
import { SettingsForm } from '@/components/SettingsForm';

export default function SettingsPage() {
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
