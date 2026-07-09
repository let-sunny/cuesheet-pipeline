import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Badge } from "@astryxdesign/core/Badge";

/** The 3 stages of the editing journey. Free navigation (no gating) — one click moves to any stage. */
export type Step = "compose" | "edit" | "finish";

interface Props {
  step: Step;
  onChange: (step: Step) => void;
  /** Compose (stage 1) progress signal: number of cuts added. */
  segmentCount: number;
  /** Edit (stage 2) progress signal: number of subtitles filled in / total cuts. */
  subtitleFilled: number;
  subtitleTotal: number;
}

/** Always-visible step navigation. Highlights the current step and shows progress badges for the compose/edit stages. */
export function StepNav({ step, onChange, segmentCount, subtitleFilled, subtitleTotal }: Props) {
  return (
    <TabList value={step} onChange={(v) => onChange(v as Step)} hasDivider size="lg">
      <Tab
        value="compose"
        label="① Scenes"
        endContent={<Badge variant="neutral" label={segmentCount} />}
        data-testid="step-tab-compose"
      />
      <Tab
        value="edit"
        label="② Edit"
        endContent={<Badge variant="neutral" label={`${subtitleFilled}/${subtitleTotal}`} />}
        data-testid="step-tab-edit"
      />
      <Tab value="finish" label="③ Export" data-testid="step-tab-finish" />
    </TabList>
  );
}
