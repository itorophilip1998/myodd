'use client';
import { LogoLoader } from './LogoLoader';
import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { accountApi, configureApiAuth } from '@/lib/api';
import { useToast } from './ToastProvider';

const SessionContext = createContext({ configured: false, signedIn: false, userId: null as string | null });
export const useAccountSession = () => useContext(SessionContext);

function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
    </svg>
  );
}

export function AccountSession({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId, getToken } = useAuth();
  const query = useQueryClient();
  const toast = useToast();
  const [readyId, setReadyId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    configureApiAuth(() => getToken(), !!userId);
    query.clear();
    setReadyId(userId ?? null);
    if (userId) {
      void accountApi.sync().catch(() => {
        toast('Your account could not sync yet. Refresh to retry; existing saves remain in the database.', { sticky: true });
      });
    }
  }, [isLoaded, userId, getToken, query, toast]);
  if (!isLoaded || readyId !== (userId ?? null)) {
    return <div className="session-loading"><LogoLoader compact label="Opening your myOdd workspace" /></div>;
  }
  return (
    <SessionContext.Provider value={{ configured: true, signedIn: !!userId, userId: userId ?? null }}>
      {children}
    </SessionContext.Provider>
  );
}

export function GuestSession({ children }: { children: React.ReactNode }) {
  return <SessionContext.Provider value={{ configured: false, signedIn: false, userId: null }}>{children}</SessionContext.Provider>;
}

export function AccountControls() {
  const session = useAccountSession();
  if (!session.configured) {
    return (
      <div className="account-controls">
        <span className="auth-pending">Sign-in setup pending</span>
      </div>
    );
  }
  if (!session.signedIn) {
    return (
      <div className="account-controls">
        <Link href="/sign-in" className="sign-in-link">Sign in</Link>
        <Link href="/sign-up" className="sign-up-link">Create account</Link>
      </div>
    );
  }
  return (
    <div className="account-controls">
      <UserButton>
        <UserButton.MenuItems>
          <UserButton.Link label="Settings" labelIcon={<SettingsIcon />} href="/settings" />
        </UserButton.MenuItems>
      </UserButton>
    </div>
  );
}

export function SignInPrompt() {
  const session = useAccountSession();
  return (
    <div className="account-welcome">
      <span>◇</span>
      <h2>Your codes, on every device.</h2>
      <p>Sign in to save collections to your account and pick up where you left off.</p>
      {session.configured ? (
        <div>
          <Link className="primary-button" href="/sign-in">Sign in</Link>
          <Link className="outline-button" href="/sign-up">Create account</Link>
        </div>
      ) : (
        <p>Clerk setup needs to be completed before sign-in is available.</p>
      )}
    </div>
  );
}
