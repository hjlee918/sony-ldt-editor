const GAMMA_LABELS = { 7: 'Gamma 7', 8: 'Gamma 8', 9: 'Gamma 9', 10: 'Gamma 10' };

function gammaLabel(val) {
  if (val >= 7 && val <= 10) return GAMMA_LABELS[val];
  if (val === 0) return 'Off';
  return `${val}`;
}

export default function ProjectorStatusBar({ status, error, onDisconnect, onUpload, selectedUploadSlot }) {
  if (!status.connected) return null;
  return (
    <div className="projector-status-bar">
      <span className="status-dot connected">●</span>
      <span className="status-info">VPL-VW385ES</span>
      <span className="status-info dimmed">Gamma: {gammaLabel(status.gammaCorrection)}</span>
      {error && <span className="status-error">{error}</span>}
      <span style={{ flex: 1 }} />
      <button className="upload-main-btn" onClick={() => onUpload(selectedUploadSlot)}>
        ⬆ Upload to {GAMMA_LABELS[selectedUploadSlot] ?? 'Slot'}
      </button>
      <button className="disconnect-btn" onClick={onDisconnect}>Disconnect</button>
    </div>
  );
}
