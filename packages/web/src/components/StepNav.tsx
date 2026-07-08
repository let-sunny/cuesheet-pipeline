import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Badge } from "@astryxdesign/core/Badge";

/** 편집 여정 3단계. 자유 이동 가능(게이트 없음) — 클릭 한 번으로 어느 단계든 이동한다. */
export type Step = "compose" | "edit" | "finish";

interface Props {
  step: Step;
  onChange: (step: Step) => void;
  /** ① 구성 진행 신호: 담은 컷 수. */
  segmentCount: number;
  /** ② 편집 진행 신호: 채운 자막 수 / 전체 컷 수. */
  subtitleFilled: number;
  subtitleTotal: number;
}

/** 항상 표시되는 스텝 내비게이션. 현재 스텝을 강조하고, 구성/편집 단계는 진행 상황 배지를 보여준다. */
export function StepNav({ step, onChange, segmentCount, subtitleFilled, subtitleTotal }: Props) {
  return (
    <TabList value={step} onChange={(v) => onChange(v as Step)} hasDivider size="lg">
      <Tab value="compose" label="① Scenes" endContent={<Badge variant="neutral" label={segmentCount} />} />
      <Tab
        value="edit"
        label="② Edit"
        endContent={<Badge variant="neutral" label={`${subtitleFilled}/${subtitleTotal}`} />}
      />
      <Tab value="finish" label="③ Export" />
    </TabList>
  );
}
