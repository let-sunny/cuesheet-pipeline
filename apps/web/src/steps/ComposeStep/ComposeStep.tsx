import type { Segment } from "@cuesheet/schema";
import { MomentPalette } from "../../components/MomentPalette/index.js";

export interface ComposeStepProps {
  segments: Segment[];
  clipDir: string;
  introPath: string | null;
  outroPath: string | null;
  onAddSegment: (seg: Segment) => void;
  onRemoveSegment: (clip: string, inS: number, outS: number) => void;
  onSetIntro: (clipFileName: string) => void;
  onSetOutro: (clipFileName: string) => void;
}

/**
 * The (1) Compose step's arrangement — currently just the scene-candidate palette
 * (screen-spec section 2). Kept as its own step component (rather than rendering MomentPalette
 * directly from App.tsx) so the step switch in App.tsx reads uniformly across all three steps,
 * and so this step has a home for its own future arrangement changes without growing App.tsx.
 */
export function ComposeStep({
  segments,
  clipDir,
  introPath,
  outroPath,
  onAddSegment,
  onRemoveSegment,
  onSetIntro,
  onSetOutro,
}: ComposeStepProps) {
  return (
    <MomentPalette
      segments={segments}
      clipDir={clipDir}
      introPath={introPath}
      outroPath={outroPath}
      onAddSegment={onAddSegment}
      onRemoveSegment={onRemoveSegment}
      onSetIntro={onSetIntro}
      onSetOutro={onSetOutro}
    />
  );
}
