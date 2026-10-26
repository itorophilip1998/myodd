'use client';
import { SettingsSync } from './SettingsSync';
import { formatAppVersion } from '@myodd/shared';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth, useSession, useUser, UserButton } from '@clerk/nextjs';
import { pauseApiAuth } from '@/lib/api-auth';
import { completeAuthFlow } from '@/lib/auth-analytics';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { accountApi, configureApiAuth } from '@/lib/api';
import { useToast } from './ToastProvider';

const SessionContext = createContext({ configured: false, ready: false, signedIn: false, userId: null as string | null });
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
  const { session } = useSession();
  const { user } = useUser();
  const query = useQueryClient();
  const toast = useToast();
  const [readyId, setReadyId] = useState<string | null | undefined>(undefined);
  const previousIdentity = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (!isLoaded) { pauseApiAuth(); return; }
    configureApiAuth(() => getToken(), !!userId);
    // Initial queries are already waiting at the identity barrier. Removing
    // them here strands their observers. On account changes reset existing
    // data while keeping active observers attached so they can refetch safely.
    if (previousIdentity.current !== undefined && previousIdentity.current !== (userId ?? null)) void query.resetQueries();
    previousIdentity.current = userId ?? null;
    setReadyId(userId ?? null);
  }, [isLoaded, userId, getToken, query]);
  useEffect(() => {
    if (isLoaded && userId) {
      void accountApi.sync().catch(() => {
        toast('Your account could not sync yet. Refresh to retry; existing saves remain in the database.', { sticky: true });
      });
    }
  }, [isLoaded, userId, toast]);
  useEffect(() => {
    if (session && user) completeAuthFlow(session, user.createdAt);
  }, [session, user]);
  const ready = isLoaded && readyId === (userId ?? null);
  return (
    <SessionContext.Provider value={{ configured: true, ready, signedIn: ready && !!userId, userId: ready ? userId ?? null : null }}>
      {ready && <SettingsSync />}{children}
    </SessionContext.Provider>
  );
}

export function GuestSession({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => { configureApiAuth(async () => null, false); }, []);
  return <SessionContext.Provider value={{ configured: false, ready: true, signedIn: false, userId: null }}>{children}</SessionContext.Provider>;
}

export function AccountControls() {
  const session = useAccountSession();
  if (session.configured && !session.ready) return <span className="account-controls" aria-live="polite">Loading account…</span>;
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
          <UserButton.Link label={formatAppVersion(process.env.NEXT_PUBLIC_APP_GIT_SHA)} labelIcon={<span aria-hidden>ⓘ</span>} href="/settings#app-version" />
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
