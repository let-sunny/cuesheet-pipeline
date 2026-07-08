import { Button } from "@astryxdesign/core/Button";
import type { Segment, SubtitleStyle, SubtitleStyleOverride } from "@cuesheet/schema";
import { INTRO_OUTRO_MAX_DURATION_S } from "../clipPaths.js";
import { narrationFileUrl, type NarrationFile } from "../api.js";
import type { MergeEligibility } from "../lib/segmentMerge.js";
import { SegmentStyleOverride } from "./SegmentStyleOverride.js";

interface Props {
  segment: Segment | undefined;
  narrationEnabled: boolean;
  /** narration.dir 안의 오디오 파일 목록(길이 포함). */
  narrationFiles: NarrationFile[];
  /** 폴더 미설정/미존재 등 안내 메시지(파일 목록이 비어 있을 때 표시). */
  narrationNote: string | undefined;
  /** 미리듣기 스트리밍 URL 구성에 쓰는 현재(저장 전 포함) 내레이션 폴더 경로. */
  narrationDir: string | undefined;
  onChange: (patch: Partial<Segment>) => void;
  /** 이 컷 원본 클립 파일의 길이 근사치(초). 초벌 하이라이트 데이터에 없는 클립이면 undefined. */
  clipDurationS: number | undefined;
  /** 이 컷의 원본 클립 파일 전체(in/out 무시)를 인트로/아웃트로로 지정한다. */
  onSetIntro: () => void;
  onSetOutro: () => void;
  /** 화면 조정(크롭)이 적용된 컷의 조정을 해제한다. */
  onClearCrop: () => void;
  /** 화면 조정 편집 모드로 진입한다(미리보기 위 오버레이에서 직접 드래그 조절). */
  onEditCrop: () => void;
  /** [다음 컷과 합치기] 버튼 활성 여부와 비활성 사유. */
  mergeEligibility: MergeEligibility;
  /** 다음 컷과 합친다(Cmd+J와 동일 동작). */
  onMergeNext: () => void;
  /** 현재 재생 위치에서 분할한다(Cmd+B와 동일 동작). */
  onSplit: () => void;
  /** 선택된 컷을 바로 뒤에 복제한다. */
  onDuplicate: () => void;
  /** 이 컷을 삭제한다(마지막 남은 컷이면 비활성). */
  onDelete: () => void;
  canDelete: boolean;
  /** 전역 자막 스타일 — 이 컷만 자막 스타일 섹션에서 오버라이드 기본값/표시값으로 쓴다. */
  globalSubtitleStyle: SubtitleStyle;
  onToggleStyleOverride: (enabled: boolean) => void;
  onChangeStyleOverride: (patch: Partial<SubtitleStyleOverride>) => void;
  onPromoteStyleOverride: () => void;
  onClearStyleOverride: () => void;
}

/**
 * 컷 설정(다듬기 단계 우측 필드 패널, PRD 4절 정본 명칭 - 옛 "인스펙터") - screen-spec
 * 4절 G1~G6 그룹 순서를 그대로 따른다: 구간 -> 재생 -> 자막(+이 컷만 자막 스타일) ->
 * 내레이션(사용 시에만) -> 화면 조정 -> 컷 작업. 그룹 소속이 모호했던 clip 파일명
 * 입력은 스펙에 명시가 없어 이 패널에서 유일하게 판단이 필요했던 요소인데, "구간"의
 * 대상 클립을 정하는 값이라 G1(구간) 그룹 맨 위에 배치했다.
 */
export function SegmentQuickFields({
  segment,
  narrationEnabled,
  narrationFiles,
  narrationNote,
  narrationDir,
  onChange,
  clipDurationS,
  onSetIntro,
  onSetOutro,
  onClearCrop,
  onEditCrop,
  mergeEligibility,
  onMergeNext,
  onSplit,
  onDuplicate,
  onDelete,
  canDelete,
  globalSubtitleStyle,
  onToggleStyleOverride,
  onChangeStyleOverride,
  onPromoteStyleOverride,
  onClearStyleOverride,
}: Props) {
  if (!segment) {
    return null;
  }

  // 이 컷의 실제 출력 길이(배속 적용 후). 선택한 내레이션 파일이 이보다 길면 다음 컷과 겹친다.
  const outputDurationS = (segment.out - segment.in) / segment.speed;
  const selectedNarrationFile = segment.narration
    ? narrationFiles.find((f) => f.name === segment.narration)
    : undefined;
  const narrationDurationWarning =
    selectedNarrationFile?.durationS != null && selectedNarrationFile.durationS > outputDurationS
      ? `컷보다 ${(selectedNarrationFile.durationS - outputDurationS).toFixed(1)}초 김 - 다음 컷과 겹칩니다`
      : null;

  const tooLongForIntroOutro =
    clipDurationS === undefined || clipDurationS > INTRO_OUTRO_MAX_DURATION_S;
  const introOutroDisabledTitle =
    clipDurationS === undefined
      ? "이 클립의 길이를 확인할 수 없어 비활성화되었습니다(초벌 하이라이트 데이터에 없는 클립)"
      : tooLongForIntroOutro
        ? `15초를 넘는 클립(추정 ${clipDurationS.toFixed(1)}s)은 인트로/아웃트로로 쓸 수 없습니다`
        : null;

  return (
    <div className="quick-fields">
      <h2 className="qf-panel-title">컷 설정</h2>

      {/* G1. 구간 */}
      <div className="qf-group">
        <div className="qf-group-label">구간</div>
        <label className="qf-field field-full">
          <span>clip</span>
          <input
            type="text"
            value={segment.clip}
            onChange={(e) => onChange({ clip: e.target.value })}
          />
        </label>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>시작</span>
            <input
              type="number"
              value={segment.in}
              min={0}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                onChange({ in: Number.isNaN(v) ? 0 : v });
              }}
            />
          </label>
          <label className="qf-field field-narrow">
            <span>끝</span>
            <input
              type="number"
              value={segment.out}
              min={0}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                onChange({ out: Number.isNaN(v) ? 0 : v });
              }}
            />
          </label>
          <span className="qf-readonly">길이 {(segment.out - segment.in).toFixed(1)}s</span>
        </div>
      </div>

      {/* G2. 재생 */}
      <div className="qf-group">
        <div className="qf-group-label">재생</div>
        <div className="qf-row">
          <label className="qf-field field-narrow">
            <span>배속</span>
            <input
              type="number"
              value={segment.speed}
              min={0.1}
              step={0.1}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                onChange({ speed: Number.isNaN(v) ? 1 : v });
              }}
            />
            <span className="qf-suffix">x</span>
          </label>
          <label className="qf-field field-narrow">
            <span>볼륨</span>
            <input
              type="number"
              value={Math.round(segment.volume * 100)}
              min={0}
              max={100}
              step={1}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isNaN(v)) {
                  return;
                }
                onChange({ volume: Math.min(100, Math.max(0, v)) / 100 });
              }}
            />
            <span className="qf-suffix">%</span>
          </label>
        </div>
      </div>

      {/* G3. 자막 (+ 하위: 이 컷만 자막 스타일) */}
      <div className="qf-group">
        <div className="qf-group-label">자막</div>
        <label className="qf-field field-full qf-subtitle-field">
          <textarea
            value={segment.subtitle}
            rows={2}
            placeholder="자막을 입력하세요"
            onChange={(e) => onChange({ subtitle: e.target.value })}
          />
        </label>

        <SegmentStyleOverride
          segment={segment}
          globalStyle={globalSubtitleStyle}
          onToggle={onToggleStyleOverride}
          onChangeOverride={onChangeStyleOverride}
          onPromote={onPromoteStyleOverride}
          onClear={onClearStyleOverride}
        />
      </div>

      {/* G4. 내레이션 (사용 중일 때만 표시) */}
      {narrationEnabled ? (
        <div className="qf-group">
          <div className="qf-group-label">내레이션</div>
          <label className="qf-field field-medium">
            <span>파일</span>
            <select
              value={segment.narration ?? ""}
              onChange={(e) =>
                onChange({ narration: e.target.value === "" ? null : e.target.value })
              }
            >
              <option value="">(없음)</option>
              {narrationFiles.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                  {f.durationS != null ? ` (${f.durationS.toFixed(1)}s)` : ""}
                </option>
              ))}
            </select>
          </label>
          {narrationFiles.length === 0 && narrationNote ? (
            <p className="narration-empty-note">{narrationNote}</p>
          ) : null}
          {selectedNarrationFile ? (
            <div className="quick-fields-narration-preview">
              <audio controls src={narrationFileUrl(selectedNarrationFile.name, narrationDir)} />
              {narrationDurationWarning ? (
                <p className="narration-warning">{narrationDurationWarning}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* G5. 화면 조정(크롭) */}
      <div className="qf-group">
        <div className="qf-group-label">화면 조정</div>
        <div className="qf-row">
          <span className="qf-readonly">{segment.crop ? "적용됨" : "적용 안 함"}</span>
          <Button
            label={segment.crop ? "다시 조정" : "화면 조정"}
            variant="secondary"
            size="sm"
            onClick={onEditCrop}
          />
          {segment.crop ? (
            <Button label="해제" variant="ghost" size="sm" onClick={onClearCrop} />
          ) : null}
        </div>
      </div>

      {/* G6. 컷 작업 */}
      <div className="qf-group">
        <div className="qf-group-label">컷 작업</div>
        <div className="qf-row qf-actions-row">
          <Button label="분할" variant="secondary" size="sm" tooltip="Cmd/Ctrl + B" onClick={onSplit} />
          <Button
            label="다음 컷과 합치기"
            variant="secondary"
            size="sm"
            isDisabled={!mergeEligibility.eligible}
            tooltip={mergeEligibility.eligible ? "Cmd/Ctrl + J" : mergeEligibility.reason}
            onClick={onMergeNext}
          />
          <Button label="복제" variant="secondary" size="sm" onClick={onDuplicate} />
          <Button
            label="인트로로"
            variant="ghost"
            size="sm"
            isDisabled={tooLongForIntroOutro}
            tooltip={
              introOutroDisabledTitle ??
              "구간(시작/끝)은 무시되고 클립 전체가 인트로로 삽입됩니다"
            }
            onClick={onSetIntro}
          />
          <Button
            label="아웃트로로"
            variant="ghost"
            size="sm"
            isDisabled={tooLongForIntroOutro}
            tooltip={
              introOutroDisabledTitle ??
              "구간(시작/끝)은 무시되고 클립 전체가 아웃트로로 삽입됩니다"
            }
            onClick={onSetOutro}
          />
          <Button
            label="삭제"
            variant="destructive"
            size="sm"
            isDisabled={!canDelete}
            tooltip={canDelete ? undefined : "마지막 남은 컷은 삭제할 수 없습니다"}
            onClick={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
