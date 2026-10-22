'use client';
import { track } from '@/lib/analytics';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, accountApi, type CollectionSummary } from '@/lib/api';
import { useToast } from './ToastProvider';

type MenuCollection = Pick<CollectionSummary, 'publicId' | 'title' | 'isPublic' | 'isOwner' | 'creator'>;

export function CollectionMenu({
  collection,
  onDelete,
  onNotice,
  onShare,
  onCheckResults,
  checking = false,
}: {
  collection: MenuCollection;
  onDelete?: () => Promise<void | boolean>;
  onNotice?: (message: string) => void;
  onShare?: () => void;
  onCheckResults?: () => Promise<void>;
  checking?: boolean;
}) {
  const router = useRouter();
  const query = useQueryClient();
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(collection.title);

  useLayoutEffect(() => {
    if (!open || !root.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const rect = root.current!.getBoundingClientRect();
      const width = 200;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      const estimatedHeight = renaming ? 210 : 200;
      const openUp = rect.top > estimatedHeight + 12;
      const top = openUp ? rect.top - 6 : rect.bottom + 6;
      setPos({ top, left, openUp });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, renaming]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (root.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
      setRenaming(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setRenaming(false);
      }
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function action(work: () => Promise<unknown>, message: string) {
    setPending(true);
    try {
      const result = await work();
      if (result === false) return;
      if (/deleted/i.test(message)) track('collection_deleted');
      if (/now public|published/i.test(message)) track('collection_published');
      await Promise.all(['history', 'group', 'public-collections'].map(key => query.invalidateQueries({ queryKey: [key] })));
      if (onNotice) onNotice(message);
      else toast(message);
      setOpen(false);
      setRenaming(false);
    } catch (e) {
      toast((e as Error).message, { sticky: true });
    } finally {
      setPending(false);
    }
  }

  const menu = open && pos && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panel}
        className="ticket-menu-panel ticket-menu-panel-fixed collection-menu-panel"
        role="menu"
        aria-label="Collection actions"
        style={{ top: pos.top, left: pos.left, transform: pos.openUp ? 'translateY(-100%)' : undefined }}
        onClick={e => e.stopPropagation()}
      >
        {renaming ? (
          <form
            onSubmit={e => {
              e.preventDefault();
              void action(() => api.editGroup(collection.publicId, { title: title.trim() }), 'Collection renamed.');
            }}
          >
            <label>
              Collection name
              <input
                aria-label="Collection name"
                value={title}
                maxLength={120}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </label>
            <button disabled={pending || !title.trim()} type="submit">✓ Save name</button>
            <button type="button" onClick={() => setRenaming(false)}>Cancel</button>
          </form>
        ) : (
          <>
            {onCheckResults && <button type="button" role="menuitem" disabled={pending || checking} onClick={() => { setOpen(false); void onCheckResults(); }}><span aria-hidden>✓</span>Check results</button>}
            {onShare && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onShare();
                }}
              >
                <span aria-hidden>⎘</span>Share
              </button>
            )}
            {!collection.isOwner && !onShare && (
              <Link href={`/g/${collection.publicId}`} role="menuitem" onClick={() => setOpen(false)}>
                <span aria-hidden>↗</span>View tickets
              </Link>
            )}
            {collection.isOwner && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={() => {
                    setTitle(collection.title);
                    setRenaming(true);
                  }}
                >
                  <span aria-hidden>✎</span>Rename collection
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  onClick={() => void action(
                    () => api.editGroup(collection.publicId, { isPublic: !collection.isPublic }),
                    collection.isPublic ? 'Collection is now private.' : 'Collection is now public.',
                  )}
                >
                  <span aria-hidden>{collection.isPublic ? '▣' : '↗'}</span>
                  {collection.isPublic ? 'Make private' : 'Make public'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="menu-danger"
                  disabled={pending}
                  onClick={() => void action(async () => {
                    if (onDelete) {
                      if (await onDelete() === false) return false;
                    } else {
                      await accountApi.remove([collection.publicId]);
                      router.push('/history');
                    }
                  }, 'Collection deleted.')}
                >
                  <span aria-hidden>⌫</span>Delete collection
                </button>
              </>
            )}
          </>
        )}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={`ticket-menu collection-menu${open ? ' is-open' : ''}`} ref={root}>
      <button
        type="button"
        className="ticket-menu-trigger"
        aria-label={`Actions for ${collection.title}`}
        aria-expanded={open}
        title="Collection actions"
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
          if (open) setRenaming(false);
        }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {menu}
    </div>
  );
}
