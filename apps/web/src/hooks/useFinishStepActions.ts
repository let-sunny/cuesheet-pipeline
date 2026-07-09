import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ShowToastFn } from "@astryxdesign/core/Toast";
import type {
  CueSheet,
  NarrationConfig,
  Project,
  SubtitleStyle,
  SubtitleStyleOverride,
  SubtitleStylePresets,
} from "@cuesheet/schema";
import { scaleCueSheetForResolution } from "../lib/subtitleScale.js";

export interface UseFinishStepActionsOptions {
  draft: CueSheet | null;
  setDraft: Dispatch<SetStateAction<CueSheet | null>>;
  recordDiscreteChange: () => void;
  recordContinuousChange: () => void;
  dirty: boolean;
  toast: ShowToastFn;
}

export interface UseFinishStepActionsResult {
  updateProject: (patch: Partial<Project>) => void;
  /** Resolution preset switching — also rescales subtitleStyle/styleOverride's absolute px values. */
  handleChangeResolution: (width: number, height: number) => void;
  updateNarration: (patch: Partial<NarrationConfig>) => void;
  updateSubtitleStyle: (patch: Partial<SubtitleStyle>) => void;
  createSubtitleStylePreset: (name: string) => void;
  updateSubtitleStylePreset: (name: string, patch: Partial<SubtitleStyleOverride>) => void;
  renameSubtitleStylePreset: (oldName: string, newName: string) => void;
  deleteSubtitleStylePreset: (name: string) => void;
  handleDownloadSrt: () => void;
}

/** The Project/Subtitle-style(global)/Presets/Narration/Output handlers backing the (3) Export step. */
export function useFinishStepActions({
  draft,
  setDraft,
  recordDiscreteChange,
  recordContinuousChange,
  dirty,
  toast,
}: UseFinishStepActionsOptions): UseFinishStepActionsResult {
  const updateProject = useCallback((patch: Partial<Project>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => (prev ? { ...prev, project: { ...prev.project, ...patch } } : prev));
  }, [draft, recordContinuousChange, setDraft]);

  // Resolution preset switching in the render settings dialog — since subtitleStyle/styleOverride's
  // absolute px values must also be scaled by the height ratio, this is a structural edit (not a
  // simple project field patch), so it uses a separate handler and just leaves one recordDiscreteChange (1 undo step) instead of updateProject.
  const handleChangeResolution = useCallback((width: number, height: number) => {
    if (!draft) {
      return;
    }
    if (draft.project.width === width && draft.project.height === height) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => (prev ? scaleCueSheetForResolution(prev, width, height) : prev));
  }, [draft, recordDiscreteChange, setDraft]);

  const updateNarration = useCallback((patch: Partial<NarrationConfig>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const base: NarrationConfig = prev.narration ?? {
        enabled: false,
        dir: "media/narration",
        volume: 1,
      };
      return { ...prev, narration: { ...base, ...patch } };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const updateSubtitleStyle = useCallback((patch: Partial<SubtitleStyle>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) =>
      prev ? { ...prev, subtitleStyle: { ...prev.subtitleStyle, ...patch } } : prev,
    );
  }, [draft, recordContinuousChange, setDraft]);

  // Subtitle style presets management (Export step) - create/rename/delete/edit. Renaming and
  // deleting also sweep every segment referencing the old name, so a cut never silently ends up
  // pointing at a preset name that no longer exists (the schema would reject that on save).
  const createSubtitleStylePreset = useCallback((name: string) => {
    if (!draft) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed || draft.subtitleStylePresets?.[trimmed]) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const subtitleStylePresets: SubtitleStylePresets = { ...(prev.subtitleStylePresets ?? {}), [trimmed]: {} };
      return { ...prev, subtitleStylePresets };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const updateSubtitleStylePreset = useCallback((name: string, patch: Partial<SubtitleStyleOverride>) => {
    if (!draft) {
      return;
    }
    recordContinuousChange();
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }
      const existing = prev.subtitleStylePresets?.[name] ?? {};
      const subtitleStylePresets: SubtitleStylePresets = {
        ...(prev.subtitleStylePresets ?? {}),
        [name]: { ...existing, ...patch },
      };
      return { ...prev, subtitleStylePresets };
    });
  }, [draft, recordContinuousChange, setDraft]);

  const renameSubtitleStylePreset = useCallback((oldName: string, newName: string) => {
    if (!draft) {
      return;
    }
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || !draft.subtitleStylePresets?.[oldName] || draft.subtitleStylePresets[trimmed]) {
      return;
    }
    recordDiscreteChange();
    setDraft((prev) => {
      const value = prev?.subtitleStylePresets?.[oldName];
      if (!prev || !value) {
        return prev;
      }
      const rest = { ...prev.subtitleStylePresets };
      delete rest[oldName];
      const segments = prev.segments.map((s) => (s.stylePreset === oldName ? { ...s, stylePreset: trimmed } : s));
      const subtitleStylePresets: SubtitleStylePresets = { ...rest, [trimmed]: value };
      return { ...prev, subtitleStylePresets, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const deleteSubtitleStylePreset = useCallback((name: string) => {
    if (!draft) {
      return;
    }
    const inUseCount = draft.segments.filter((s) => s.stylePreset === name).length;
    if (inUseCount > 0) {
      const confirmed = window.confirm(
        `${inUseCount} cut(s) use the "${name}" preset - remove it from those cuts too?`,
      );
      if (!confirmed) {
        return;
      }
    }
    recordDiscreteChange();
    setDraft((prev) => {
      if (!prev?.subtitleStylePresets) {
        return prev;
      }
      const { [name]: _removed, ...rest } = prev.subtitleStylePresets;
      const segments = prev.segments.map((s) => (s.stylePreset === name ? { ...s, stylePreset: null } : s));
      return { ...prev, subtitleStylePresets: rest, segments };
    });
  }, [draft, recordDiscreteChange, setDraft]);

  const handleDownloadSrt = useCallback(() => {
    if (dirty) {
      toast({ type: "info", body: "Save first before downloading." });
      return;
    }
    window.location.href = "/api/subtitles.srt";
  }, [dirty, toast]);

  return {
    updateProject,
    handleChangeResolution,
    updateNarration,
    updateSubtitleStyle,
    createSubtitleStylePreset,
    updateSubtitleStylePreset,
    renameSubtitleStylePreset,
    deleteSubtitleStylePreset,
    handleDownloadSrt,
  };
}
