'use client';
import { LogoLoader } from './LogoLoader';
import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { accountApi, configureApiAuth } from '@/lib/api';
const SessionContext = createContext({ configured: false, signedIn: false, userId: null as string | null });
export const useAccountSession = () => useContext(SessionContext);
export function AccountSession({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId, getToken } = useAuth();
  const query = useQueryClient(); const [readyId, setReadyId] = useState<string | null | undefined>(undefined);
  const [syncError, setSyncError] = useState('');
  useEffect(() => {
    if (!isLoaded) return;
    configureApiAuth(() => getToken(), !!userId);
    query.clear(); // Never show a previous account's cached history after sign-out or switching users.
    setReadyId(userId ?? null);
    setSyncError('');
    if (userId) void accountApi.sync().catch(() => setSyncError('Your account could not sync yet. Refresh to retry; existing saves remain in the database.'));
  }, [isLoaded, userId, getToken, query]);
  if (!isLoaded || readyId !== (userId ?? null)) return <div className="session-loading"><LogoLoader compact label="Opening your myOdd workspace" /></div>;
  return <SessionContext.Provider value={{ configured: true, signedIn: !!userId, userId: userId ?? null }}>{syncError && <p role="alert" className="account-sync-error">{syncError}</p>}{children}</SessionContext.Provider>;
}
export function GuestSession({ children }: { children: React.ReactNode }) {
  return <SessionContext.Provider value={{ configured: false, signedIn: false, userId: null }}>{children}</SessionContext.Provider>;
}
export function AccountControls() {
  const session = useAccountSession();
  if (!session.configured) return <span className="auth-pending">Sign-in setup pending</span>;
  return <div className="account-controls">{session.signedIn ? <UserButton /> : <><Link href="/sign-in" className="sign-in-link">Sign in</Link><Link href="/sign-up" className="sign-up-link">Create account</Link></>}</div>;
}
export function SignInPrompt() {
  const session = useAccountSession();
  return <div className="account-welcome"><span>◇</span><h2>Your codes, on every device.</h2><p>Sign in to save collections to your account and pick up where you left off.</p>{session.configured ? <div><Link className="primary-button" href="/sign-in">Sign in</Link><Link className="outline-button" href="/sign-up">Create account</Link></div> : <p>Clerk setup needs to be completed before sign-in is available.</p>}</div>;
}
