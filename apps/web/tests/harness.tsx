import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '../src/components/SettingsProvider';
import { SettingsSync } from '../src/components/SettingsSync';
import { SettingsForm } from '../src/components/SettingsForm';
import { ToastProvider, useToast } from '../src/components/ToastProvider';
import { SaveCollection } from '../src/components/SaveCollection';

function Notifications() {
  const toast = useToast();
  return <><button onClick={() => toast('Test one', { sticky: true })}>First toast</button><button onClick={() => toast('Test two', { sticky: true })}>Second toast</button></>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><SettingsProvider><ToastProvider>
  <SettingsSync />
  {location.pathname === '/settings-fixture' ? <SettingsForm /> : location.pathname === '/toasts-fixture' ? <Notifications /> : <SaveCollection publicId="fixture-collection" title="Weekend Football Picks" isOwner />}
</ToastProvider></SettingsProvider></QueryClientProvider>);
