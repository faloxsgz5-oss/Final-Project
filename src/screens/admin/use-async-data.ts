/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useRef, useState} from 'react';

export type AsyncData<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/**
 * Loads per-user admin data, keyed by an explicit request identity.
 *
 * `key` must encode everything the request depends on (selected UID, month,
 * ...) because `load` is read from a ref: that keeps an inline arrow function
 * from re-firing the request on every render, while still refetching whenever
 * the identity genuinely changes.
 *
 * A stale-response guard is essential here. Switching users faster than
 * Firestore responds would otherwise let an older request resolve last and
 * paint one user's data underneath another user's name.
 */
export function useAsyncData<T>(key: string, load: () => Promise<T>, enabled = true): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);
  const ticketRef = useRef(0);
  const mountedRef = useRef(true);
  const loadRef = useRef(load);

  // Refreshed after every commit, and declared before the fetching effect so
  // the newest loader is always in place before a fetch can start.
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Invalidate any in-flight request; only the newest ticket may commit.
    const ticket = ticketRef.current + 1;
    ticketRef.current = ticket;

    if (!enabled) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    loadRef.current()
      .then((result) => {
        if (!mountedRef.current || ticketRef.current !== ticket) return;
        setData(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!mountedRef.current || ticketRef.current !== ticket) return;
        setError(cause instanceof Error ? cause.message : 'โหลดข้อมูลไม่สำเร็จ');
        setLoading(false);
      });
  }, [enabled, key, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return {data, error, loading, reload};
}
