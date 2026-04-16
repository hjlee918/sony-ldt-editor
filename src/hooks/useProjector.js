import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_IP = 'projectorLastIp';
const POLL_INTERVAL_MS = 5000;

/**
 * useProjector — manages projector connection state and exposes actions.
 *
 * Returns:
 *   status         — ProjectorStatus object (connected: false when disconnected)
 *   uploadProgress — null | 0-100 (percentage during upload)
 *   error          — null | 'err_auth' | 'err_connect' (last connection error)
 *   lastIp         — last used IP from localStorage
 *   connect(ip, password?) — async, returns 'ok' | error code
 *   disconnect()   — async
 *   set(upper, lower, value) — async, updates status after success
 *   upload(slot, channels)   — async, manages uploadProgress state
 */
export function useProjector() {
  const [status, setStatus] = useState({ connected: false });
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);
  const [lastIp, setLastIp] = useState(
    () => localStorage.getItem(STORAGE_IP) || '',
  );
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const s = await window.projector?.getStatus();
      if (!s || !s.connected) {
        stopPolling();
        setStatus({ connected: false });
      } else {
        setStatus(s);
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  // Clean up on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const connect = useCallback(
    async (ip, password) => {
      setError(null);
      const result = await window.projector?.connect(ip, password);
      if (result === 'ok') {
        localStorage.setItem(STORAGE_IP, ip);
        setLastIp(ip);
        const s = await window.projector?.getStatus();
        setStatus(s);
        startPolling();
      } else {
        setError(result ?? 'err_connect');
      }
      return result;
    },
    [startPolling],
  );

  const disconnect = useCallback(async () => {
    stopPolling();
    await window.projector?.disconnect();
    setStatus({ connected: false });
    setError(null);
  }, [stopPolling]);

  const set = useCallback(async (upper, lower, value) => {
    setError(null);
    const result = await window.projector?.set(upper, lower, value);
    if (result === 'ok') {
      const s = await window.projector?.getStatus();
      setStatus(s);
    } else if (result != null) {
      setError(result);
    }
    return result;
  }, []);

  const upload = useCallback(async (slot, channels) => {
    setError(null);
    setUploadProgress(0);
    const unsub = window.projector?.on('upload-progress', (pct) => {
      setUploadProgress(pct);
    });
    let result;
    try {
      result = await window.projector?.upload(slot, channels);
    } catch (err) {
      const code = err?.message ?? 'err_upload';
      setError(code);
      result = code;
    } finally {
      unsub?.();
      setUploadProgress(null);
    }
    return result;
  }, []);

  return { status, uploadProgress, error, lastIp, connect, disconnect, set, upload };
}
