import { useState, useEffect, useCallback, useRef } from 'react';

// Maps SDCP item (upper, lower) → ProjectorStatus field name for optimistic updates
const ITEM_FIELD = {
  '00:22': 'gammaCorrection',
  '00:10': 'brightness',
  '00:11': 'contrast',
  '00:17': 'colorTemp',
  '00:3b': 'colorSpace',
  '00:02': 'calibPreset',
  '00:59': 'motionflow',
  '00:7c': 'hdr',
  '00:1d': 'advancedIris',
  '00:25': 'nr',
  '00:76': 'csCustomCyanRed',
  '00:77': 'csCustomMagGreen',
};

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
  const isBusyRef = useRef(false); // true while a SET (or post-SET status fetch) is in flight
  const lastActivatedSlotRef = useRef(null); // persists user-chosen active slot across polls

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (isBusyRef.current) return; // skip poll while SET is in flight
      const s = await window.projector?.getStatus();
      if (!s || !s.connected) {
        stopPolling();
        setStatus({ connected: false });
      } else {
        // Don't let the poll revert a user-chosen active slot
        if (lastActivatedSlotRef.current !== null) {
          s.gammaCorrection = lastActivatedSlotRef.current;
        }
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
        setStatus({ connected: true }); // show UI immediately
        startPolling(); // first poll (5s) will populate all values
        window.projector?.getStatus().then((s) => { if (s) setStatus(s); }); // also fetch now in background
      } else {
        setError(result ?? 'err_connect');
      }
      return result;
    },
    [startPolling],
  );

  const disconnect = useCallback(async () => {
    stopPolling();
    lastActivatedSlotRef.current = null;
    await window.projector?.disconnect();
    setStatus({ connected: false });
    setError(null);
  }, [stopPolling]);

  const set = useCallback(async (upper, lower, value) => {
    setError(null);
    isBusyRef.current = true;
    try {
      const result = await window.projector?.set(upper, lower, value);
      if (result === 'ok') {
        // Optimistic update: apply just the changed field immediately.
        // The projector may not return the new value on an immediate GET
        // (it needs a moment to apply the change), so we avoid a full
        // getStatus() re-query here and let the 5-second poll confirm.
        const key = `${upper.toString(16).padStart(2,'0')}:${lower.toString(16).padStart(2,'0')}`;
        const field = ITEM_FIELD[key];
        if (field) {
          setStatus(prev => ({ ...prev, [field]: value }));
        }
      } else if (result != null) {
        setError(result);
      }
      return result;
    } finally {
      isBusyRef.current = false;
    }
  }, []);

  const activateSlot = useCallback(async (slot) => {
    setError(null);
    const result = await window.projector?.activateSlot(slot);
    if (result === 'ok') {
      // Remember user's choice so polls don't revert the display
      lastActivatedSlotRef.current = slot;
      setStatus(prev => ({ ...prev, gammaCorrection: slot }));
    } else if (result != null) {
      setError(result);
    }
    return result;
  }, []);

  const download = useCallback(async (slot) => {
    setError(null);
    try {
      const channels = await window.projector?.download(slot);
      return channels ?? null;
    } catch (err) {
      setError(err?.message ?? 'err_download');
      return null;
    }
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

  return { status, uploadProgress, error, lastIp, connect, disconnect, set, activateSlot, upload, download };
}
