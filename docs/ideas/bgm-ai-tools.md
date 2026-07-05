# 채널 전용 BGM: AI 음악 생성 툴 리서치 결론 (2026-07-06)

목적: 저작권 분쟁 없는 채널 전용 사운드 킷 — 인트로 징글(고정) + 아웃트로 테마(고정) +
상황별 BGM 3종(잔잔한 뜨개 작업 / 외출·이벤트 / 빨리감기 몽타주). 수익화 유튜브 전제.

## 결론

- **1순위: ElevenLabs Music** (Starter 월 $6~) — 상업 라이선스 조건이 가장 명확, 학습데이터
  소송 없음, 루프 기능이 실제로 구현된 유일한 툴(Looping + Inpainting), Finetunes로 채널
  사운드 일관성 고정. **보너스: 목소리 클로닝 내레이션(별도 계획)도 같은 구독으로 해결.**
- 2순위: Suno Pro (월 $10, 카카오페이/네이버페이 지원 확인) — Persona로 스타일 고정,
  프롬프트 노하우 최다. 단 저작권 소송 진행 중 + 배상 책임 사용자 일방.
- **배제: Udio** — 2025 음반사(UMG/WMG) 합의 여파로 2026-07 현재 다운로드 자체가 차단됨.
- **보류: Google Flow Music/Lyria 3** — 상업 조건 공식 확인 불가 + 학습데이터 소송 진행 중.
  (MusicFX는 2026-07-31 서비스 종료 확정.)
- 스톡 라이브러리(Artlist/Epidemic)는 경쟁재가 아닌 병행재 — 법적으로 가장 안전하지만
  채널 고유 사운드는 못 만듦. 화이트리스팅은 "구독 중 게시분만 영구 보호"라는 함정 유의.

## 운영 수칙 (반드시)

1. 무료 티어 생성물 사용 금지 — 전 툴 공통으로 비상업 조건.
2. **인트로/아웃트로는 테마곡 1~2분을 한 번 생성해 그 한 파일에서 앞/뒤를 잘라 쓴다** —
   재생성마다 음색이 달라지므로 같은 파일에서 자르는 것이 음색 일치의 유일한 방법.
3. 생성 기록 보관(프롬프트/타임스탬프/당시 구독 티어) — 분쟁 시 근거.
4. 유튜브 업로드 시 "변조 또는 합성 콘텐츠" 라벨 토글 (2026 정책상 필수).
5. AI 트랙 간 교차 Content ID 클레임 가능성 존재 — 클레임은 스트라이크가 아니고 30일 내
   이의제기 가능하니 당황하지 말 것. 어떤 툴도 사용자 배상(indemnification)은 없음.

## 프롬프트 시작점 (cozy 뜨개 무드, instrumental 고정)

- 인트로 징글: "Ultra short universal logo jingle, warm acoustic, fingerpicked guitar
  swell, soft piano chime, gentle rise, no verse, no chorus, single musical phrase,
  broadcast bumper feel, clean ending hit, instrumental"
- 뜨개 작업(잔잔): "warm lo-fi acoustic, cozy autumn afternoon mood, slow tempo 75 BPM,
  fingerpicked acoustic guitar, soft rhodes piano, warm upright bass, gentle brushed
  drums, vinyl crackle, unhurried and comfortable, instrumental, no vocals"
- 외출·이벤트: "upbeat acoustic pop, bright and inviting, jangly guitar, light
  percussion, feel-good adventurous mood, sunny outdoor vibe, 110 BPM, instrumental"
- 몽타주(빨리감기): "upbeat acoustic folk, driving strummed guitar, banjo, light
  energetic percussion, joyful high-energy mood, 130 BPM, instrumental"

## 파이프라인 연결

만든 음원은 `media/bgm/`에 두고 큐시트 `bgm[]`(file/start/end/volume)으로 사용 — 웹
타임라인에서 드래그 배치 가능. 이후 확장: 초벌 조립 시 구간 성격(잔잔/외출/몽타주)에 따라
자동 선곡 + 인트로/아웃트로 고정 삽입.
