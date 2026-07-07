import { Slider } from "@astryxdesign/core/Slider";
import type { Segment } from "@cuesheet/schema";
import { INTRO_OUTRO_MAX_DURATION_S } from "../clipPaths.js";
import { narrationFileUrl, type NarrationFile } from "../api.js";

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
  /** crop이 적용된 컷의 crop을 해제한다. */
  onClearCrop: () => void;
  /** 크롭 편집 모드로 진입한다(미리보기 위 오버레이에서 직접 드래그 조절). */
  onEditCrop: () => void;
}

/**
 * 편집 단계(②) 우측 필드 패널: 자막 textarea가 최상단(트리밍하면서 그 컷 자막을
 * 바로 고침), 배속/볼륨 입력이 그다음, clip 파일명·내레이션·in/out 숫자 입력은
 * 보조로 축소되어 있다(핸들 드래그가 주된 트림 방법). 장면 설명은 비디오 위
 * 맥락 헤더(VideoPreview)에서만 보여준다 — 여기서는 중복 표시하지 않는다.
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
      <label className="quick-fields-subtitle">
        <span>자막</span>
        <textarea
          value={segment.subtitle}
          rows={2}
          placeholder="자막을 입력하세요"
          onChange={(e) => onChange({ subtitle: e.target.value })}
        />
      </label>

      <div className="quick-fields-primary">
        <label className="settings-field">
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
        </label>
        <div className="volume-field">
          <Slider
            label="볼륨"
            value={Math.round(segment.volume * 100)}
            min={0}
            max={100}
            step={5}
            valueDisplay="text"
            width={220}
            onChange={(v: number) => onChange({ volume: v / 100 })}
          />
          <input
            type="number"
            className="volume-number-input"
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
          <span className="volume-unit">%</span>
        </div>
      </div>

      <div className="quick-fields-secondary">
        <label className="segment-field wide">
          <span>clip</span>
          <input
            type="text"
            value={segment.clip}
            onChange={(e) => onChange({ clip: e.target.value })}
          />
        </label>
        <label className="segment-field narrow">
          <span>in</span>
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
        <label className="segment-field narrow">
          <span>out</span>
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
        {narrationEnabled ? (
          <label className="segment-field wide">
            <span>내레이션</span>
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
        ) : null}
      </div>

      {narrationEnabled && narrationFiles.length === 0 && narrationNote ? (
        <p className="narration-empty-note">{narrationNote}</p>
      ) : null}

      {narrationEnabled && selectedNarrationFile ? (
        <div className="quick-fields-narration-preview">
          <audio controls src={narrationFileUrl(selectedNarrationFile.name, narrationDir)} />
          {narrationDurationWarning ? (
            <p className="narration-warning">{narrationDurationWarning}</p>
          ) : null}
        </div>
      ) : null}

      <div className="quick-fields-io">
        <span className="quick-fields-io-label">이 컷의 원본 클립 전체를</span>
        <button
          type="button"
          className="moment-io-button"
          disabled={tooLongForIntroOutro}
          title={
            introOutroDisabledTitle ??
            "구간(in/out)은 무시되고 클립 전체가 인트로로 삽입됩니다"
          }
          onClick={onSetIntro}
        >
          인트로로 지정
        </button>
        <button
          type="button"
          className="moment-io-button"
          disabled={tooLongForIntroOutro}
          title={
            introOutroDisabledTitle ??
            "구간(in/out)은 무시되고 클립 전체가 아웃트로로 삽입됩니다"
          }
          onClick={onSetOutro}
        >
          아웃트로로 지정
        </button>
        <span className="quick-fields-io-note">
          (현재 컷의 in/out 구간은 무시되고 클립 전체가 통째로 들어갑니다)
        </span>
      </div>

      <div className="quick-fields-crop">
        {segment.crop ? (
          <>
            <span>크롭 적용됨</span>
            <button type="button" onClick={onEditCrop}>
              편집
            </button>
            <button type="button" onClick={onClearCrop}>
              해제
            </button>
          </>
        ) : (
          <button type="button" onClick={onEditCrop}>
            크롭 추가
          </button>
        )}
      </div>
    </div>
  );
}
