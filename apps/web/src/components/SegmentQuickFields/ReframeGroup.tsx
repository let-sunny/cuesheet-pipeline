import { Button } from "@astryxdesign/core/Button";

export interface ReframeGroupProps {
  hasCrop: boolean;
  onEditCrop: () => void;
  onClearCrop: () => void;
}

/** G7. Reframe (crop) - status display + [Reframe/Adjust again] [Clear] (Edit opens an overlay
 * mode on the video). */
export function ReframeGroup({ hasCrop, onEditCrop, onClearCrop }: ReframeGroupProps) {
  return (
    <div className="qf-group" data-testid="cut-settings-group-reframe">
      <div className="qf-group-label">Reframe</div>
      <div className="qf-row">
        <span className="qf-readonly">{hasCrop ? "Applied" : "Not applied"}</span>
        <Button label={hasCrop ? "Adjust again" : "Reframe"} variant="secondary" size="sm" onClick={onEditCrop} />
        {hasCrop ? <Button label="Clear" variant="ghost" size="sm" onClick={onClearCrop} /> : null}
      </div>
    </div>
  );
}
