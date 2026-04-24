import { useState, useEffect, useCallback, useRef } from 'react';

// Maps SDCP item (upper, lower) → ProjectorStatus field name for optimistic updates
const ITEM_FIELD = {
  // ── Picture / Core ──
  '00:02': 'calibPreset',
  '00:11': 'contrast',
  '00:10': 'brightness',
  '00:12': 'color',
  '00:13': 'hue',
  '00:17': 'colorTemp',
  '00:24': 'sharpness',
  // ── Cinema Black Pro ──
  '00:1d': 'advancedIris',
  '00:1a': 'irisAperture',
  '00:1e': 'contrastEnhancer',
  '00:1f': 'lampControl',
  // ── Processing ──
  '00:59': 'motionflow',
  '00:20': 'realityCreation',
  // ── Expert: Noise ──
  '00:25': 'nr',
  '00:26': 'mpegNr',
  '00:27': 'smoothGradation',
  '00:23': 'filmMode',
  // ── Expert: Gamma / HDR ──
  '00:22': 'gammaCorrection',
  '00:7c': 'hdr',
  '00:99': 'inputLagReduction',
  '00:28': 'clearWhite',
  '00:29': 'xvColor',
  // ── Color Space ──
  '00:3b': 'colorSpace',
  '00:76': 'csRCyanRed',  '00:a1': 'csGCyanRed',  '00:a2': 'csBCyanRed',
  '00:77': 'csRMagGreen', '00:a3': 'csGMagGreen',  '00:a4': 'csBMagGreen',
  // ── Color Temp Custom ──
  '00:30': 'ctGainR', '00:31': 'ctGainG', '00:32': 'ctGainB',
  '00:33': 'ctBiasR', '00:34': 'ctBiasG', '00:35': 'ctBiasB',
  // ── Color Correction ──
  '00:87': 'ccRHue', '00:88': 'ccRSat', '00:89': 'ccRBri',
  '00:8a': 'ccYHue', '00:8b': 'ccYSat', '00:8c': 'ccYBri',
  '00:8d': 'ccGHue', '00:8e': 'ccGSat', '00:8f': 'ccGBri',
  '00:90': 'ccCHue', '00:91': 'ccCSat', '00:92': 'ccCBri',
  '00:93': 'ccBHue', '00:94': 'ccBSat', '00:95': 'ccBBri',
  '00:96': 'ccMHue', '00:97': 'ccMSat', '00:98': 'ccMBri',
  // ── Screen ──
  '00:3c': 'aspect',
  '00:78': 'blankLeft', '00:79': 'blankRight',
  '00:7a': 'blankTop',  '00:7b': 'blankBottom',
  '00:7d': 'blankingEnabled',
  // ── Function ──
  '00:60': 'dynamicRangeH1',
  '00:61': 'hdmiFormatH1',
  '00:6e': 'dynamicRangeH2',  // best-guess; needs pcap verification
  '00:6f': 'hdmiFormatH2',    // best-guess; needs pcap verification
  '00:65': 'd3Display', '00:66': 'd3Format', '00:67': 'd3Brightness',
  // ── Setup / Installation ──
  '00:63': 'testPattern',
  '00:64': 'altitudeMode',
  '00:62': 'imageFlip',
  '00:68': 'remoteStart',
  '00:69': 'networkMgmt',
  '00:6a': 'powerSaving',
  '00:6b': 'lensControl',
  '00:6c': 'irReceiver',
  // ── Power / Input ──
  '00:03': 'inputSelect',
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
  const isPollingRef = useRef(false); // true while a getStatus() poll is in flight (prevents stacking)
  const lastActivatedSlotRef = useRef(null); // persists user-chosen active slot across polls
  const ipRef = useRef(''); // persists IP so polls can re-attach it to status

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      if (isBusyRef.current || isPollingRef.current) return; // skip if SET or prior poll still in flight
      isPollingRef.current = true;
      try {
        const s = await window.projector?.getStatus(true); // lite mode: ~12 GETs vs ~67
        if (!s || !s.connected) {
          stopPolling();
          setStatus({ connected: false });
        } else {
          // Don't let the poll revert a user-chosen active slot
          if (lastActivatedSlotRef.current !== null) {
            s.gammaCorrection = lastActivatedSlotRef.current;
          }
          // Merge: only overwrite fields that the projector actually returned (not undefined).
          // This preserves optimistic updates for best-guess item codes that the projector
          // doesn't recognise (e.g. CC fields, hdr) — they come back as undefined from
          // getStatus() and should not revert the user's last-set value.
          setStatus(prev => ({
            ...prev,
            ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)),
            ip: ipRef.current,
          }));
        }
      } finally {
        isPollingRef.current = false;
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
        ipRef.current = ip;
        setStatus({ connected: true, ip }); // show UI immediately
        startPolling(); // first poll (5s) will populate all values
        window.projector?.getStatus().then((s) => { if (s) setStatus({ ...s, ip }); }); // also fetch now in background
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
    ipRef.current = '';
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
        const key = `${upper.toString(16).padStart(2,'0')}:${lower.toString(16).padStart(2,'0')}`;
        const field = ITEM_FIELD[key];
        if (field) {
          setStatus(prev => ({ ...prev, [field]: value }));
        }
        // When input changes the projector loads per-input picture settings
        // (color correction, gamma, etc.). Trigger a full re-fetch so the UI
        // reflects the new input's values instead of stale ones.
        if (key === '00:03') {
          setTimeout(() => {
            window.projector?.getStatus().then(s => {
              if (s) setStatus(prev => ({
                ...prev,
                ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)),
                ip: ipRef.current,
              }));
            });
          }, 1500); // allow projector ~1.5 s to apply the input switch
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
    stopPolling(); // don't let a poll lock contend with the download
    try {
      const channels = await window.projector?.download(slot);
      return channels ?? null;
    } catch (err) {
      setError(err?.message ?? 'err_download');
      return null;
    } finally {
      startPolling();
    }
  }, [stopPolling, startPolling]);

  const upload = useCallback(async (slot, channels) => {
    setError(null);
    setUploadProgress(0);
    stopPolling(); // don't let a poll lock contend with the upload
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
      startPolling();
    }
    return result;
  }, [stopPolling, startPolling]);

  const picPos = useCallback(async (action, slot) => {
    setError(null);
    const result = await window.projector?.picPos(action, slot);
    if (result != null && result !== 'ok') setError(result);
    return result;
  }, []);

  const key = useCallback(async (keyCode) => {
    setError(null);
    const result = await window.projector?.key(keyCode);
    if (result != null && result !== 'ok') setError(result);
    return result;
  }, []);

  return { status, uploadProgress, error, lastIp, connect, disconnect, set, activateSlot, upload, download, picPos, key };
}
