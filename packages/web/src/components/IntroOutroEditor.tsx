interface Props {
  intro: string | null;
  outro: string | null;
  onChange: (patch: { intro?: string | null; outro?: string | null }) => void;
}

function localVideoUrl(path: string): string {
  return `/api/local-video?path=${encodeURIComponent(path)}`;
}

/**
 * intro/outro 파일 경로 입력(비우면 null) + 경로가 있으면 인라인 video 미리보기.
 * intro/outro는 clipDir와 무관한 독립 파일 경로(schema 주석 참고).
 */
export function IntroOutroEditor({ intro, outro, onChange }: Props) {
  return (
    <div className="intro-outro-editor">
      <div className="settings-group">
        <h3>인트로</h3>
        <label className="settings-field wide-input">
          <span>경로</span>
          <input
            type="text"
            value={intro ?? ""}
            placeholder="비우면 없음"
            onChange={(e) => onChange({ intro: e.target.value === "" ? null : e.target.value })}
          />
        </label>
        {intro ? <video className="intro-outro-preview" src={localVideoUrl(intro)} controls /> : null}
      </div>

      <div className="settings-group">
        <h3>아웃트로</h3>
        <label className="settings-field wide-input">
          <span>경로</span>
          <input
            type="text"
            value={outro ?? ""}
            placeholder="비우면 없음"
            onChange={(e) => onChange({ outro: e.target.value === "" ? null : e.target.value })}
          />
        </label>
        {outro ? <video className="intro-outro-preview" src={localVideoUrl(outro)} controls /> : null}
      </div>
    </div>
  );
}
