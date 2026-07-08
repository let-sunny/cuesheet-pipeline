import { Button } from "@astryxdesign/core/Button";
import type { BgmCue } from "@cuesheet/schema";

interface Props {
  bgm: BgmCue[];
  onChange: (i: number, patch: Partial<BgmCue>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}

export function BgmEditor({ bgm, onChange, onAdd, onRemove }: Props) {
  return (
    <div className="bgm-editor">
      {bgm.length === 0 ? (
        <div className="empty">No background music (BGM) added</div>
      ) : (
        <div className="bgm-rows">
          {bgm.map((cue, i) => (
            <div className="bgm-row" key={i}>
              <label className="segment-field">
                <span>file</span>
                <input
                  type="text"
                  value={cue.file}
                  onChange={(e) => onChange(i, { file: e.target.value })}
                />
              </label>
              <label className="segment-field narrow">
                <span>start</span>
                <input
                  type="number"
                  value={cue.start}
                  min={0}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    onChange(i, { start: Number.isNaN(v) ? 0 : v });
                  }}
                />
              </label>
              <label className="segment-field narrow">
                <span>end</span>
                <input
                  type="number"
                  value={cue.end}
                  min={0}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    onChange(i, { end: Number.isNaN(v) ? 0 : v });
                  }}
                />
              </label>
              <label className="segment-field narrow">
                <span>volume</span>
                <input
                  type="number"
                  value={cue.volume}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    onChange(i, { volume: Number.isNaN(v) ? 0 : v });
                  }}
                />
              </label>
              <div className="segment-row-actions">
                <Button label="Delete" variant="destructive" size="sm" onClick={() => onRemove(i)} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Button label="Add background music (BGM)" variant="secondary" size="sm" className="add-button" onClick={onAdd} />
    </div>
  );
}
