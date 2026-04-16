const SLOTS = [
  { id: 7, label: 'Gamma 7' },
  { id: 8, label: 'Gamma 8' },
  { id: 9, label: 'Gamma 9' },
  { id: 10, label: 'Gamma 10' },
];

// gammaCorrection values from SDCP: 7=Gamma7, 8=Gamma8, 9=Gamma9, 10=Gamma10
function activeSlotFromValue(val) {
  if (val >= 7 && val <= 10) return val;
  return null;
}

export default function GammaSlots({ status, onUpload, onUseSlot, uploadProgress }) {
  const activeSlot = activeSlotFromValue(status.gammaCorrection);

  return (
    <div className="proj-section">
      <div className="proj-section-label">GAMMA SLOTS</div>
      {SLOTS.map((slot) => {
        const isActive = activeSlot === slot.id;
        const isUploading = uploadProgress !== null;
        return (
          <div key={slot.id} className={`gamma-slot-row${isActive ? ' active' : ''}`}>
            <span className="slot-label">
              {slot.label}{isActive ? ' ▶' : ''}
            </span>
            <button
              className="slot-btn upload"
              disabled={isUploading}
              onClick={() => onUpload(slot.id)}
            >
              {isUploading && isActive
                ? `${uploadProgress}%`
                : '⬆ Upload'}
            </button>
            <button
              className={`slot-btn use${isActive ? ' active' : ''}`}
              onClick={() => onUseSlot(slot.id)}
            >
              {isActive ? 'Active' : '▶ Use'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
