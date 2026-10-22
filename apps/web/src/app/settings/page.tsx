import { SettingsForm } from '@/components/SettingsForm';
export default function SettingsPage() {
  return <main className="workspace settings-workspace"><header className="settings-page-head"><h1>Settings</h1><p>Changes save on this device. Sign in to synchronize your preferences.</p></header><SettingsForm /></main>;
}
