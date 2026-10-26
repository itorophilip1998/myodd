'use client';
import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { beginAuthFlow } from '@/lib/auth-analytics';
export function AuthFlowAnalytics() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => { if (isLoaded && !userId) beginAuthFlow(); }, [isLoaded, userId]);
  return null;
}
