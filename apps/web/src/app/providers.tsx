'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SettingsProvider } from '@/components/SettingsProvider';
import { ToastProvider } from '@/components/ToastProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: 300_000, gcTime: 1800_000, retry: (count, error) => count < 1 && ![400, 401, 403, 404, 409, 422].includes((error as Error & { status?: number }).status ?? 0) },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <ToastProvider>{children}</ToastProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
