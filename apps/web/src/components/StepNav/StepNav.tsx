import { TabList } from "@astryxdesign/core/TabList";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Download, Film, Scissors } from "lucide-react";
import { NavTab } from "../ui/NavTab/index.js";

/** The 3 stages of the editing journey. Free navigation (no gating) — one click moves to any stage. */
export type Step = "compose" | "edit" | "finish";

interface Props {
  step: Step;
  onChange: (step: Step) => void;
  /** Compose (stage 1) progress: scene candidates in use / total candidates (selection, not final cuts). */
  sceneInUse: number;
  sceneTotal: number;
  /** Edit (stage 2) progress: subtitles filled in / total cuts. */
  subtitleFilled: number;
  subtitleTotal: number;
}

/** Always-visible step navigation. Highlights the current step and shows progress badges for the compose/edit stages. */
export function StepNav({ step, onChange, sceneInUse, sceneTotal, subtitleFilled, subtitleTotal }: Props) {
  return (
    <TabList value={step} onChange={(v) => onChange(v as Step)} hasDivider size="lg">
      <NavTab
        value="compose"
        label="Scenes"
        icon={<Icon icon={Film} />}
        endContent={<Badge variant="neutral" label={`${sceneInUse}/${sceneTotal}`} />}
        data-testid="step-tab-compose"
      />
      <NavTab
        value="edit"
        label="Edit"
        icon={<Icon icon={Scissors} />}
        endContent={<Badge variant="neutral" label={`${subtitleFilled}/${subtitleTotal} subtitled`} />}
        data-testid="step-tab-edit"
      />
      <NavTab value="finish" label="Export" icon={<Icon icon={Download} />} data-testid="step-tab-finish" />
    </TabList>
  );
}
