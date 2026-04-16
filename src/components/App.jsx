import { useState, useRef, useEffect, useCallback } from 'react';
import { MAX_VALUE, ENTRIES_PER_CHANNEL, parseLDT, buildLDT } from '../lib/ldt';
import { cubicSpline, getControlPointPositions, curveToControlPoints } from '../lib/spline';
import { generateGamma, generateLinear, generateSCurve, generatePQ, generateHLG, generateBT1886 } from '../lib/generators';
import { drawCanvas } from '../lib/canvas';
import { formatValue, parseValue, formatMax, formatStep } from '../lib/format';
import { useHistory } from '../lib/history';

const MAX = MAX_VALUE;
const CHANNEL_COLORS = ['#c43030', '#1a7a42', '#2060b0'];
const CHANNEL_BG = ['rgba(196,48,48,0.08)', 'rgba(26,122,66,0.08)', 'rgba(32,96,176,0.08)'];
const CHANNEL_NAMES = ['Red', 'Green', 'Blue'];

export default function App() {
  const initCurve = generateGamma(2.2);
  const [channels, setChannels] = useState(() => [initCurve.slice(), initCurve.slice(), initCurve.slice()]);
  const [activeCh, setActiveCh] = useState(0);
  const [linked, setLinked] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(null);
  const [mode, setMode] = useState(10);
  const [controlPts, setControlPts] = useState(() => curveToControlPoints(initCurve, getControlPointPositions(10)));
  const [activePointIdx, setActivePointIdx] = useState(-1);
  const [draggingPt, setDraggingPt] = useState(false);
  const [panning, setPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [pqNits, setPqNits] = useState(200);
  const [notif, setNotif] = useState(null);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveFileName, setSaveFileName] = useState('custom_gamma.ldt');
  const [freeDragging, setFreeDragging] = useState(false);
  const [displayFmt, setDisplayFmt] = useState('10bit');
  const [compareChannels, setCompareChannels] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
  const [pqPreview, setPqPreview] = useState(null);
  const [bt1886Lb, setBt1886Lb] = useState(0.005);
  const [smoothPasses, setSmoothPasses] = useState(1);
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'projector'

  const lastFreePt = useRef(null);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);

  const history = useHistory([initCurve.slice(), initCurve.slice(), initCurve.slice()]);

  const fmtVal = (v) => formatValue(v, displayFmt);
  const parseVal = (s) => parseValue(s, displayFmt);
  const fmtMax = () => formatMax(displayFmt);
  const fmtStp = () => formatStep(displayFmt);

  const notify = (m) => { setNotif(m); setTimeout(() => setNotif(null), 2500); };
  const commitHistory = (ch) => { history.push(ch); };

  // ─── Undo / Redo / Reset ───
  const doUndo = () => {
    const prev = history.undo();
    if (prev) { setChannels(prev); if (mode !== 'free') setControlPts(curveToControlPoints(prev[activeCh], getControlPointPositions(mode))); notify('Undo'); }
  };
  const doRedo = () => {
    const next = history.redo();
    if (next) { setChannels(next); if (mode !== 'free') setControlPts(curveToControlPoints(next[activeCh], getControlPointPositions(mode))); notify('Redo'); }
  };
  const doReset = () => {
    const c = generateGamma(2.2);
    const ch = [c.slice(), c.slice(), c.slice()];
    setChannels(ch); commitHistory(ch);
    if (mode !== 'free') setControlPts(curveToControlPoints(c, getControlPointPositions(mode)));
    notify('Reset to γ 2.2');
  };

  // ─── Curve rebuilding ───
  const rebuildFromPts = useCallback((pts) => {
    const curve = cubicSpline(pts);
    let nc;
    if (linked) nc = [curve.slice(), curve.slice(), curve.slice()];
    else { nc = channels.map(c => c.slice()); nc[activeCh] = curve; }
    setChannels(nc);
    return nc;
  }, [linked, channels, activeCh]);

  const switchMode = (newMode) => {
    setMode(newMode);
    if (newMode === 'free') return;
    setControlPts(curveToControlPoints(channels[activeCh], getControlPointPositions(newMode)));
    setActivePointIdx(-1);
  };

  const applyPreset = (fn) => {
    const curve = fn();
    let nc;
    if (linked) nc = [curve.slice(), curve.slice(), curve.slice()];
    else { nc = channels.map(c => c.slice()); nc[activeCh] = curve; }
    setChannels(nc); commitHistory(nc);
    if (mode !== 'free') setControlPts(curveToControlPoints(curve, getControlPointPositions(mode)));
  };

  // ─── Canvas resize & redraw ───
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
      c.width = r.width * dpr; c.height = r.height * dpr;
      drawCanvas(c, channels, activeCh, zoom, pan, mode !== 'free' ? controlPts : null, activePointIdx, mode, fmtVal, showCompare ? compareChannels : null, pqPreview);
    });
    ro.observe(c.parentElement);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    drawCanvas(c, channels, activeCh, zoom, pan, mode !== 'free' ? controlPts : null, activePointIdx, mode, fmtVal, showCompare ? compareChannels : null, pqPreview);
  }, [channels, activeCh, zoom, pan, controlPts, activePointIdx, mode, displayFmt, compareChannels, showCompare, pqPreview]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); doRedo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); setShowSaveAs(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doUndo, doRedo]);

  // ─── Mouse → value conversion ───
  const c2v = useCallback((e) => {
    const c = canvasRef.current, r = c.getBoundingClientRect();
    const w = r.width, hh = r.height;
    const p_ = { t: 18, r: 18, b: 38, l: 50 }, gw = w - p_.l - p_.r, gh = hh - p_.t - p_.b;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const vx0 = pan.x, vx1 = pan.x + MAX / zoom, vy0 = pan.y, vy1 = pan.y + MAX / zoom;
    return {
      input: Math.max(0, Math.min(MAX, Math.round(vx0 + ((mx - p_.l) / gw) * (vx1 - vx0)))),
      output: Math.max(0, Math.min(MAX, Math.round(vy1 - ((my - p_.t) / gh) * (vy1 - vy0)))),
      px: mx, py: my,
    };
  }, [zoom, pan]);

  const findNearestPt = useCallback((mx, my) => {
    if (mode === 'free' || !controlPts.length) return -1;
    const c = canvasRef.current, r = c.getBoundingClientRect();
    const w = r.width, hh = r.height;
    const p_ = { t: 18, r: 18, b: 38, l: 50 }, gw = w - p_.l - p_.r, gh = hh - p_.t - p_.b;
    const vx0 = pan.x, vx1 = pan.x + MAX / zoom, vy0 = pan.y, vy1 = pan.y + MAX / zoom;
    const toX = v => p_.l + ((v - vx0) / (vx1 - vx0)) * gw;
    const toY = v => p_.t + gh - ((v - vy0) / (vy1 - vy0)) * gh;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < controlPts.length; i++) {
      const px = toX(controlPts[i].x), py = toY(controlPts[i].y);
      const d = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (d < bestD) { bestD = d; best = i; }
    }
    return bestD < 22 ? best : -1;
  }, [controlPts, mode, zoom, pan]);

  const freeInterp = (from, to, ch, nc) => {
    const x0 = Math.min(from.input, to.input), x1 = Math.max(from.input, to.input);
    const y0 = from.input < to.input ? from.output : to.output;
    const y1 = from.input < to.input ? to.output : from.output;
    for (let x = x0; x <= x1; x++) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      const v = Math.max(0, Math.min(MAX, Math.round(y0 + t * (y1 - y0))));
      if (linked) { nc[0][x] = v; nc[1][x] = v; nc[2][x] = v; } else nc[ch][x] = v;
    }
  };

  // ─── Mouse handlers ───
  const onDown = (e) => {
    if (e.button !== 0) return;
    const val = c2v(e);
    if (e.altKey) { setPanning(true); setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }); return; }
    if (mode === 'free') {
      setFreeDragging(true); lastFreePt.current = val;
      const nc = channels.map(c => c.slice());
      if (linked) { nc[0][val.input] = val.output; nc[1][val.input] = val.output; nc[2][val.input] = val.output; }
      else nc[activeCh][val.input] = val.output;
      setChannels(nc); return;
    }
    const idx = findNearestPt(val.px, val.py);
    if (idx >= 0) { setActivePointIdx(idx); setDraggingPt(true); }
    else if (zoom > 1) { setPanning(true); setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }); }
  };

  const onMove = (e) => {
    const val = c2v(e);
    setHover(val);
    if (panning && panStart) {
      const c = canvasRef.current, r = c.getBoundingClientRect();
      const p_ = { t: 18, r: 18, b: 38, l: 50 }, gw = r.width - p_.l - p_.r, gh = r.height - p_.t - p_.b;
      const range = MAX / zoom;
      const dx = -(e.clientX - panStart.mx) / gw * range;
      const dy = (e.clientY - panStart.my) / gh * range;
      setPan({ x: Math.max(0, Math.min(MAX - range, panStart.px + dx)), y: Math.max(0, Math.min(MAX - range, panStart.py + dy)) });
      return;
    }
    if (mode === 'free' && freeDragging) {
      const nc = channels.map(c => c.slice());
      if (lastFreePt.current) freeInterp(lastFreePt.current, val, activeCh, nc);
      lastFreePt.current = val; setChannels(nc); return;
    }
    if (draggingPt && activePointIdx >= 0) {
      const newPts = controlPts.map((p, i) => {
        if (i !== activePointIdx) return p;
        let minX = 0, maxX = MAX;
        if (i > 0) minX = controlPts[i - 1].x + 1;
        if (i < controlPts.length - 1) maxX = controlPts[i + 1].x - 1;
        return { x: Math.max(minX, Math.min(maxX, val.input)), y: Math.max(0, Math.min(MAX, val.output)) };
      });
      setControlPts(newPts); rebuildFromPts(newPts);
    } else if (mode !== 'free') {
      const idx = findNearestPt(val.px, val.py);
      if (idx !== activePointIdx && !draggingPt) setActivePointIdx(idx);
    }
  };

  const onUp = () => {
    if (draggingPt || freeDragging) commitHistory(channels);
    setDraggingPt(false); setFreeDragging(false); setPanning(false); setPanStart(null); lastFreePt.current = null;
  };

  const onWheel = (e) => {
    e.preventDefault();
    const val = c2v(e);
    const newZoom = Math.max(1, Math.min(16, zoom * (e.deltaY < 0 ? 1.15 : 0.87)));
    const range = MAX / zoom, newRange = MAX / newZoom;
    const frac = (val.input - pan.x) / range, fracY = (val.output - pan.y) / range;
    setZoom(newZoom);
    if (newZoom > 1) setPan({ x: Math.max(0, Math.min(MAX - newRange, val.input - frac * newRange)), y: Math.max(0, Math.min(MAX - newRange, val.output - fracY * newRange)) });
    else setPan({ x: 0, y: 0 });
  };

  // ─── Table editing ───
  const updatePtValue = (idx, newY) => {
    const newPts = controlPts.map((p, i) => i === idx ? { x: p.x, y: Math.max(0, Math.min(MAX, newY)) } : p);
    setControlPts(newPts); const nc = rebuildFromPts(newPts); commitHistory(nc);
  };
  const updatePtX = (idx, newX) => {
    const n = controlPts.length;
    let minX = 0, maxX = MAX;
    if (idx > 0) minX = controlPts[idx - 1].x + 1;
    if (idx < n - 1) maxX = controlPts[idx + 1].x - 1;
    const clamped = Math.max(minX, Math.min(maxX, Math.max(0, Math.min(MAX, newX))));
    const newPts = controlPts.map((p, i) => i === idx ? { x: clamped, y: p.y } : p);
    setControlPts(newPts); const nc = rebuildFromPts(newPts); commitHistory(nc);
  };

  // ─── File I/O ───
  const doImport = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const parsed = parseLDT(ev.target.result);
        setChannels(parsed); commitHistory(parsed);
        if (mode !== 'free') setControlPts(curveToControlPoints(parsed[activeCh], getControlPointPositions(mode)));
        notify('Loaded: ' + f.name);
      } catch (er) { notify('Error: ' + er.message); }
    };
    r.readAsArrayBuffer(f); e.target.value = '';
  };

  const doExport = (name) => {
    const fn = name || saveFileName;
    const finalName = fn.endsWith('.ldt') ? fn : fn + '.ldt';
    const buf = buildLDT(channels);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = finalName; a.click();
    URL.revokeObjectURL(url);
    notify('Exported: ' + finalName);
  };

  const smooth = () => {
    const nc = channels.map(c => c.slice());
    const tgts = linked ? [0, 1, 2] : [activeCh];
    for (const ch of tgts) {
      for (let pass = 0; pass < smoothPasses; pass++) {
        const s = nc[ch], sm = s.slice();
        for (let i = 2; i < ENTRIES_PER_CHANNEL - 2; i++)
          sm[i] = Math.round((s[i - 2] + s[i - 1] + s[i] + s[i + 1] + s[i + 2]) / 5);
        nc[ch] = sm;
      }
    }
    setChannels(nc); commitHistory(nc);
    if (mode !== 'free') setControlPts(curveToControlPoints(nc[activeCh], getControlPointPositions(mode)));
    notify(`Smoothed ×${smoothPasses}`);
  };

  const copyAll = () => {
    const s = channels[activeCh].slice();
    const nc = [s.slice(), s.slice(), s.slice()];
    setChannels(nc); commitHistory(nc);
    notify('Copied ' + CHANNEL_NAMES[activeCh] + ' → All');
  };

  // Resync control points when switching channel
  useEffect(() => {
    if (mode !== 'free') setControlPts(curveToControlPoints(channels[activeCh], getControlPointPositions(mode)));
  }, [activeCh]);

  // ─── Render ───
  return (
    <div className="app-shell">
      <div className="tab-bar">
        <button
          className={`tab-btn${activeTab === 'editor' ? ' active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          Editor
        </button>
        <button
          className={`tab-btn${activeTab === 'projector' ? ' active' : ''}`}
          onClick={() => setActiveTab('projector')}
        >
          Projector
        </button>
      </div>
      <div className="tab-content">
        <div style={{ display: activeTab === 'editor' ? 'contents' : 'none' }}>
    <div className="app">
      {notif && <div className="notif">{notif}</div>}
      <input ref={fileRef} type="file" accept=".ldt" style={{ display: 'none' }} onChange={doImport} />

      {/* Save As Modal */}
      {showSaveAs && (
        <div className="modal-overlay" onClick={() => setShowSaveAs(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Export As</h3>
            <input className="modal-input" type="text" value={saveFileName} onChange={e => setSaveFileName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { doExport(saveFileName); setShowSaveAs(false); } }} />
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
              File will be saved in Sony ImageDirector .ldt format (LDT v0200, 10-bit, 3ch × 1024)
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowSaveAs(false)}>Cancel</button>
              <button className="btn btn-accent" onClick={() => { doExport(saveFileName); setShowSaveAs(false); }}>Export</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="header">
        <div>
          <div className="header-title"><em>Sony LDT</em> Gamma Editor</div>
          <div className="header-sub">VPL-VW385ES / VW260ES / VW360ES — 10-bit LUT · 1024 × 3ch</div>
        </div>
        <div className="header-actions">
          <button className="btn" onClick={() => fileRef.current?.click()}>Import .ldt</button>
          <button className="btn btn-accent" onClick={() => setShowSaveAs(true)}>Export As…</button>
        </div>
      </div>

      <div className="main">
        <div className="canvas-area">
          {/* Toolbar */}
          <div className="toolbar">
            {[0, 1, 2].map(ch => (
              <button key={ch} className="ch-btn" onClick={() => setActiveCh(ch)}
                style={{ borderColor: activeCh === ch ? CHANNEL_COLORS[ch] : 'rgba(0,0,0,0.1)', background: activeCh === ch ? CHANNEL_BG[ch] : 'transparent', color: activeCh === ch ? CHANNEL_COLORS[ch] : '#88877e' }}>
                {CHANNEL_NAMES[ch][0]}
              </button>
            ))}
            <div className="toolbar-sep" />
            <button className={`btn btn-sm ${linked ? 'btn-active' : ''}`} onClick={() => setLinked(!linked)}>
              {linked ? '🔗 Linked' : '🔓 Independent'}
            </button>
            <div className="toolbar-sep" />
            {['free', 4, 10, 21].map(m => (
              <button key={m} className={`mode-btn${mode === m ? ' active' : ''}`} onClick={() => switchMode(m)}>
                {m === 'free' ? 'Free' : m + 'pt'}
              </button>
            ))}
            <div className="toolbar-sep" />
            <button className="btn btn-sm" onClick={smooth}>Smooth</button>
            <input type="number" min={1} max={50} value={smoothPasses} onChange={e => setSmoothPasses(Math.max(1, Math.min(50, +e.target.value || 1)))}
              style={{ width: 40, padding: '3px 5px', fontSize: 12, fontFamily: 'var(--mono)', border: '1px solid var(--border2)', borderRadius: 5, background: 'var(--bg)', color: 'var(--text2)', textAlign: 'center' }} title="Smooth passes (1–50)" />
            <button className="btn btn-sm" onClick={copyAll}>Copy→All</button>
            <div className="toolbar-sep" />
            <button className="btn btn-sm" onClick={() => { setCompareChannels(channels.map(c => c.slice())); setShowCompare(true); notify('Reference set'); }}>Set Ref</button>
            {compareChannels && (
              <button className={`btn btn-sm${showCompare ? ' btn-active' : ''}`} onClick={() => setShowCompare(v => !v)}>Compare</button>
            )}
            <div className="toolbar-sep" />
            <button className="btn btn-sm" disabled={!history.canUndo} onClick={doUndo} style={{ opacity: history.canUndo ? 1 : 0.35 }}>↩ Undo</button>
            <button className="btn btn-sm" disabled={!history.canRedo} onClick={doRedo} style={{ opacity: history.canRedo ? 1 : 0.35 }}>↪ Redo</button>
            <button className="btn btn-sm btn-danger" onClick={doReset}>Reset</button>
            <div className="toolbar-sep" />
            {[['8bit', '8-bit'], ['10bit', '10-bit'], ['pct', '%']].map(([k, label]) => (
              <button key={k} className={`mode-btn${displayFmt === k ? ' active' : ''}`} style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setDisplayFmt(k)}>{label}</button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Zoom</span>
            <input type="range" min={1} max={10} step={0.1} value={zoom} onChange={e => setZoom(+e.target.value)} style={{ width: 70 }} />
            <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)', minWidth: 32 }}>{zoom.toFixed(1)}×</span>
            {zoom > 1 && <button className="btn btn-sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button>}
          </div>

          {/* Canvas */}
          <div className="canvas-wrap">
            <canvas ref={canvasRef}
              style={{ cursor: panning ? 'grabbing' : draggingPt || freeDragging ? 'crosshair' : zoom > 1 ? 'grab' : 'default' }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
              onMouseLeave={() => { onUp(); setHover(null); }}
              onWheel={onWheel} />
            {pqPreview && (
              <div className="canvas-overlay" style={{ top: 8, left: 8, color: 'var(--accent)', borderColor: 'var(--accent-border)', background: 'rgba(255,252,240,0.94)' }}>
                Preview: PQ {pqNits} nit
              </div>
            )}
            {hover && (
              <div className="canvas-overlay" style={{ top: 8, right: 8 }}>
                In: <span style={{ color: 'var(--text)', fontWeight: 500 }}>{fmtVal(hover.input)}</span>
                {'  '}Out: <span style={{ color: CHANNEL_COLORS[activeCh], fontWeight: 500 }}>{fmtVal(channels[activeCh][Math.min(hover.input, MAX)])}</span>
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 11, color: 'var(--text4)', fontFamily: 'var(--mono)', pointerEvents: 'none' }}>
              {mode === 'free' ? 'Draw on canvas · Alt+drag or drag empty area to pan' : 'Drag points freely · Alt+drag or drag empty area to pan'}
            </div>
          </div>

          {/* Control Points Table */}
          {mode !== 'free' && (
            <div style={{ background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)', padding: 10, overflow: 'auto', maxHeight: 240, flexShrink: 0 }}>
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Input</th>
                    {linked
                      ? <th style={{ color: 'var(--accent)' }}>Output</th>
                      : [0, 1, 2].map(ch => <th key={ch} style={{ color: CHANNEL_COLORS[ch] }}>{CHANNEL_NAMES[ch][0]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {controlPts.map((pt, i) => (
                    <tr key={i} style={{ background: activePointIdx === i ? 'rgba(154,123,46,0.06)' : 'transparent' }} onClick={() => setActivePointIdx(i)}>
                      <td>
                        <input type="number" className="cp-input" min={0} max={fmtMax()} step={fmtStp()} value={fmtVal(pt.x)}
                          style={{ color: 'var(--text2)', width: 60 }}
                          onChange={e => updatePtX(i, parseVal(e.target.value))} />
                      </td>
                      {linked
                        ? <td><input type="number" className="cp-input" min={0} max={fmtMax()} step={fmtStp()} value={fmtVal(pt.y)} style={{ color: 'var(--accent)' }} onChange={e => updatePtValue(i, parseVal(e.target.value))} /></td>
                        : [0, 1, 2].map(ch => (
                          <td key={ch}>
                            <input type="number" className="cp-input" min={0} max={fmtMax()} step={fmtStp()}
                              value={fmtVal(ch === activeCh ? pt.y : channels[ch][pt.x])}
                              style={{ color: CHANNEL_COLORS[ch] }}
                              onChange={e => {
                                const v10 = parseVal(e.target.value);
                                if (ch === activeCh) updatePtValue(i, v10);
                                else { const nc = channels.map(c => c.slice()); nc[ch][pt.x] = Math.max(0, Math.min(MAX, v10)); setChannels(nc); commitHistory(nc); }
                              }} />
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          <div className="sb-section">
            <div className="sb-label" style={{ color: 'var(--text3)' }}>Standard Gamma</div>
            <div className="preset-grid preset-grid-3">
              {[['Linear', generateLinear], ['γ 1.8', () => generateGamma(1.8)], ['γ 2.0', () => generateGamma(2.0)],
                ['γ 2.2', () => generateGamma(2.2)], ['γ 2.4', () => generateGamma(2.4)], ['γ 2.6', () => generateGamma(2.6)],
                ['S-Curve', () => generateSCurve(1.5)]].map(([label, fn]) => (
                <button key={label} className="btn btn-sm" onClick={() => applyPreset(fn)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="sb-section">
            <div className="sb-label" style={{ color: 'var(--accent)' }}>HDR PQ (ST.2084)</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
                <span>Target brightness</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 500 }}>{pqNits} nits</span>
              </div>
              <input type="range" min={50} max={4000} step={10} value={pqNits}
                onChange={e => { const n = +e.target.value; setPqNits(n); setPqPreview(generatePQ(n)); }}
                onMouseUp={() => setPqPreview(null)}
                onTouchEnd={() => setPqPreview(null)}
                style={{ width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>
                <span>50</span><span>1000</span><span>4000</span>
              </div>
            </div>
            <button className="btn btn-accent" style={{ width: '100%', marginBottom: 6 }} onClick={() => { applyPreset(() => generatePQ(pqNits)); setPqPreview(null); }}>
              Generate PQ → {pqNits} nit
            </button>
            <div className="preset-grid preset-grid-3">
              {[100, 200, 300, 500, 1000, 4000].map(n => (
                <button key={n} className="btn btn-sm" onClick={() => { applyPreset(() => generatePQ(n)); setPqPreview(null); }}>{n} nit</button>
              ))}
            </div>
          </div>

          <div className="sb-section">
            <div className="sb-label" style={{ color: 'var(--cyan)' }}>HLG</div>
            <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => applyPreset(() => generateHLG(1.2))}>HLG (system γ 1.2)</button>
          </div>

          <div className="sb-section">
            <div className="sb-label" style={{ color: 'var(--text3)' }}>BT.1886</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
                <span>Black level (Lb)</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{(bt1886Lb * 100).toFixed(2)}%</span>
              </div>
              <input type="range" min={0} max={0.05} step={0.001} value={bt1886Lb} onChange={e => setBt1886Lb(+e.target.value)} style={{ width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>
                <span>0% (ideal)</span><span>2.5%</span><span>5%</span>
              </div>
            </div>
            <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => applyPreset(() => generateBT1886(bt1886Lb))}>
              BT.1886 (Lb {(bt1886Lb * 100).toFixed(2)}%)
            </button>
          </div>

          <div className="info-box" style={{ background: 'rgba(154,123,46,0.04)', border: '1px solid rgba(154,123,46,0.12)' }}>
            <h4 style={{ color: 'var(--accent)' }}>How to use</h4>
            <ol style={{ color: 'var(--text2)' }}>
              <li>Choose edit mode: 4pt / 10pt / 21pt / Free</li>
              <li>Select a preset or drag control points</li>
              <li>Fine-tune values in the table</li>
              <li>Export As… → name your .ldt file</li>
              <li>Open in Sony ImageDirector → upload</li>
            </ol>
          </div>

          <div className="info-box" style={{ background: 'rgba(32,96,176,0.04)', border: '1px solid rgba(32,96,176,0.1)' }}>
            <h4 style={{ color: 'var(--blue)' }}>Controls</h4>
            <p style={{ color: 'var(--text2)' }}>
              <b>Drag points</b> — move horizontally and vertically.{' '}
              <b>Scroll</b> — zoom toward cursor.{' '}
              <b>Alt+drag / drag empty area</b> — pan when zoomed.{' '}
              <b>⌘Z</b> — undo. <b>⌘⇧Z</b> — redo. <b>⌘S</b> — export.
            </p>
          </div>

          <div className="info-box" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <h4 style={{ color: 'var(--text2)' }}>LDT File Format</h4>
            <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7 }}>
              LDT v0200 · 512-byte header<br />
              3ch × 1024 × 16-bit LE<br />
              10-bit (0–1023) · Descending order<br />
              Compatible: VPL-VW260/360/385ES
            </div>
          </div>
        </div>
      </div>
    </div>
        </div>
        {activeTab === 'projector' && (
          <div className="projector-tab-placeholder" style={{ padding: 32, color: '#666' }}>
            Projector tab — coming soon
          </div>
        )}
      </div>
    </div>
  );
}
