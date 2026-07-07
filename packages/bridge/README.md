# @cuesheet/bridge

Claude Code가 붙는 MCP 서버 — 사용자가 자기 Claude Code에서 자연어로 명령하면
("음성 30%로 낮춰줘" 등) Claude Code가 이 서버의 툴로 큐시트(JSON)를 직접
편집한다. 앱에 Claude API를 심지 않으므로 추가 비용이 없다.

## 툴

- **`get_cuesheet`** — 현재 큐시트 전체를 반환한다. 편집 전엔 항상 이걸 먼저
  호출해서 최신 값을 읽어야 한다.
- **`update_cuesheet`** — 큐시트 전체를 새 값으로 교체한다. 자유도의 핵심 —
  어떤 편집이든 새 큐시트를 통째로 계산해서 넘기면 된다. `@cuesheet/schema`의
  `validateCueSheet`로 검증하고, 통과해야만 저장한다. 실패하면 저장하지 않고
  `필드경로: 이유` 형식의 에러 목록을 반환한다.

## 등록

루트 `.mcp.json`에 등록되어 있다:

```json
{
  "mcpServers": {
    "cuesheet-bridge": {
      "command": "node",
      "args": ["packages/bridge/dist/index.js"],
      "env": { "CUESHEET_PATH": "project.cuesheet.json" }
    }
  }
}
```

Claude Code가 이 설정으로 서버를 붙이면 `get_cuesheet`/`update_cuesheet` 툴을
바로 쓸 수 있다.

## CUESHEET_PATH

편집 대상 큐시트 파일 경로. 지정 없으면 `./project.cuesheet.json`. `@cuesheet/web`
개발 서버가 같은 파일을 `fs.watch`로 감시하므로, 브리지로 편집한 결과가 웹
미리보기에 즉시 반영된다.

## 빌드 / 타입체크 / 테스트

```bash
pnpm --filter @cuesheet/bridge build
pnpm --filter @cuesheet/bridge typecheck
pnpm --filter @cuesheet/bridge test
```
