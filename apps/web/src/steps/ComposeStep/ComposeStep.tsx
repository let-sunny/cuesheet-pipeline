import type { Segment } from "@cuesheet/schema";
import { MomentPalette } from "../../components/MomentPalette/index.js";

export interface ComposeStepProps {
  segments: Segment[];
  onAddSegment: (seg: Segment) => void;
  onRemoveSegment: (clip: string, inS: number, outS: number) => void;
}

/**
 * The (1) Compose step's arrangement — currently just the scene-candidate palette
 * (screen-spec section 2). Kept as its own step component (rather than rendering MomentPalette
 * directly from App.tsx) so the step switch in App.tsx reads uniformly across all three steps,
 * and so this step has a home for its own future arrangement changes without growing App.tsx.
 */
export function ComposeStep({ segments, onAddSegment, onRemoveSegment }: ComposeStepProps) {
  return <MomentPalette segments={segments} onAddSegment={onAddSegment} onRemoveSegment={onRemoveSegment} />;
}
