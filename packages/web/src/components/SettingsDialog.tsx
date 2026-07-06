import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import type { Project } from "@cuesheet/schema";
import { ProjectMetaFields } from "./ProjectMetaFields.js";

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project: Project;
  onProjectChange: (patch: Partial<Project>) => void;
}

/** 프로젝트명/fps/해상도만 다루는 설정 모달. 매 에피소드 안 바뀌는 값이라 여정에서 제외하고 여기 모아둔다. */
export function SettingsDialog({ isOpen, onOpenChange, project, onProjectChange }: Props) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} width={420}>
      <Layout
        header={<DialogHeader title="프로젝트 설정" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <ProjectMetaFields project={project} onChange={onProjectChange} />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
