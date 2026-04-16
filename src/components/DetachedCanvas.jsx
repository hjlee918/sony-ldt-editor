import { useEffect, useRef, useState } from 'react';
import { drawCanvas } from '../lib/canvas';
import { formatValue } from '../lib/format';

/**
 * DetachedCanvas — canvas-only view for the second Electron window.
 * Receives curve data via canvasBridge.onCurveSync IPC.
 */
export default function DetachedCanvas() {
  const canvasRef = useRef(null);
  const [channels, setChannels] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!window.canvasBridge) return;
    const unsub = window.canvasBridge.onCurveSync((data) => {
      setChannels(data.channels);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !channels) return;
    // Match the canvas physical size to its CSS size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    drawCanvas(
      canvas,
      channels,
      0,       // activeCh
      zoom,
      pan,
      [],      // controlPts (none in detached view)
      -1,      // activePointIdx
      'free',  // mode
      (v) => formatValue(v, '10bit'),
      null,    // compareChannels
      null,    // previewCurve
    );
  }, [channels, zoom, pan]);

  if (!channels) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#999',
          fontFamily: 'sans-serif',
        }}
      >
        Waiting for curve data from main window…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f7f6f3' }}>
      <canvas
        ref={canvasRef}
        style={{ flex: 1, width: '100%', display: 'block' }}
      />
    </div>
  );
}
