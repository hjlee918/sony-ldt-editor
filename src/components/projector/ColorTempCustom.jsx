// src/components/projector/ColorTempCustom.jsx
import { SectionCard, Slider } from './Controls';

const SLOT_LABELS = { 3: 'Custom 1', 4: 'Custom 2', 5: 'Custom 3', 6: 'Custom 4', 7: 'Custom 5' };

export default function ColorTempCustom({ status, onSet }) {
  const slot = status.colorTemp;
  if (slot < 3 || slot > 7) return null;

  return (
    <SectionCard title={`Color Temp — ${SLOT_LABELS[slot]}`}>
      <Slider label="Gain R" value={status.ctGainR ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x30, v)} />
      <Slider label="Gain G" value={status.ctGainG ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x31, v)} />
      <Slider label="Gain B" value={status.ctGainB ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x32, v)} />
      <Slider label="Bias R" value={status.ctBiasR ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x33, v)} />
      <Slider label="Bias G" value={status.ctBiasG ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x34, v)} />
      <Slider label="Bias B" value={status.ctBiasB ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x35, v)} />
    </SectionCard>
  );
}
