import { SettingsForm } from '@/components/SettingsForm';
import { BackLink } from '@/components/BackButton';

export default function SettingsPage() {
  return <main className="workspace settings-workspace">
    <header className="settings-page-head">
      <div><p className="eyebrow">SYSTEM</p><h1>Settings</h1><p>Defaults for Create and sound cues. Changes save as you edit.</p></div>
      <BackLink href="/" label="Create" className="outline-button" />
    </header>
    <SettingsForm />
  </main>;
}
