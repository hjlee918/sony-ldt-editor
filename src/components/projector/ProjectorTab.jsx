import { useState } from 'react';
import ConnectionPanel from './ConnectionPanel';
import ProjectorStatusBar from './ProjectorStatusBar';
import GammaSlots from './GammaSlots';
import PictureSettings from './PictureSettings';
import { useProjector } from '../../hooks/useProjector';

const CALIB_OPTS = [
  { value: 0, label: 'Cinema Film 1' }, { value: 1, label: 'Cinema Film 2' },
  { value: 2, label: 'Reference' }, { value: 3, label: 'TV' }, { value: 4, label: 'Photo' },
  { value: 5, label: 'Game' }, { value: 6, label: 'Bright Cinema' }, { value: 7, label: 'Bright TV' },
  { value: 8, label: 'User' },
];

export default function ProjectorTab({ currentChannels }) {
  const { status, uploadProgress, error, lastIp, connect, disconnect, set, upload } = useProjector();
  const [selectedSlot, setSelectedSlot] = useState(10);

  const handleUpload = (slot) => {
    if (!currentChannels) return;
    setSelectedSlot(slot);
    upload(slot, currentChannels);
  };

  const handleUseSlot = (slot) => {
    // Gamma Correction item: 00h 22h, values 0007h-000Ah for G7-G10
    set(0x00, 0x22, slot);
  };

  if (!status.connected) {
    return <ConnectionPanel onConnect={connect} lastIp={lastIp} error={error} />;
  }

  return (
    <div className="projector-tab">
      <ProjectorStatusBar
        status={status}
        onDisconnect={disconnect}
        onUpload={handleUpload}
        selectedUploadSlot={selectedSlot}
      />
      <div className="projector-columns">
        {/* Left column */}
        <div className="projector-col-left">
          <div className="proj-section">
            <div className="proj-section-label">POWER</div>
            <div className="proj-btn-row">
              <button
                className={`proj-toggle-btn${status.power === 1 ? ' active' : ''}`}
                onClick={() => set(0x01, 0x30, 0x0001)}
              >ON</button>
              <button
                className={`proj-toggle-btn${status.power !== 1 ? ' active' : ''}`}
                onClick={() => set(0x01, 0x30, 0x0000)}
              >Standby</button>
            </div>
          </div>
          <div className="proj-section">
            <div className="proj-section-label">CALIB PRESET</div>
            <select
              className="proj-select-full"
              value={status.calibPreset ?? 0}
              onChange={(e) => set(0x00, 0x02, parseInt(e.target.value))}
            >
              {CALIB_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <GammaSlots
            status={status}
            onUpload={handleUpload}
            onUseSlot={handleUseSlot}
            uploadProgress={uploadProgress}
          />
        </div>
        {/* Right column */}
        <div className="projector-col-right">
          <PictureSettings status={status} onSet={set} />
        </div>
      </div>
    </div>
  );
}
