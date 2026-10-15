# 로드맵 (ROADMAP)

> 에이전트는 **체크되지 않은 첫 번째 항목 하나**만 작업한다. 끝나면 체크하고, 완료 기준을 어떻게 확인했는지 한 줄 남긴다.
> 사용자가 해야 하는 일은 `[사용자]`로 표시했다. 에이전트는 이 항목을 대신하지 않고, 필요하면 사용자에게 요청한다.

## 0단계: 사전 준비

- [x] [사용자] 사람인 API 이용신청 (2026-10-13 신청, 승인 대기)
- [ ] [사용자] 사람인 승인 후 access-key 발급 → `.env`의 `SARAMIN_ACCESS_KEY`에 입력
- [ ] [사용자] 4주차 전에 `claude setup-token`으로 OAuth 토큰 발급 → GitHub Secret `CLAUDE_CODE_OAUTH_TOKEN`에 등록
- [ ] [사용자] Resend 가입, API 키 발급
- [x] [사용자] GitHub 비공개 저장소 생성
- [x] [사용자] `profile.example.yaml`을 복사해 `profile.yaml` 작성 (트랙 3개 확인, 희망 지역, 관심 기업, 제외 키워드)

## 1주차: 기반 다지기

완료 기준: `npm run dry` 실행 시 가짜 공고 3건이 `out/preview.html`에 표시된다.

- [x] 프로젝트 초기화: `package.json`(type: module), TypeScript, tsx, ESLint, Prettier, Vitest 설정. `npm run typecheck/test/lint`가 동작
- [x] `src/types.ts`: `Job`, `ScoredJob` zod 스키마와 타입
- [x] `src/config.ts`: `.env`와 `profile.yaml`을 읽고 zod로 검증. 키가 없으면 어떤 키가 빠졌는지 알려주고 종료
- [x] `src/index.ts`: 파이프라인 뼈대 + `--dry-run` 플래그. 지금은 가짜 공고 3건으로 끝까지 흐르게
- [x] 아주 단순한 HTML로 `out/preview.html` 출력 (React Email은 3주차)

## 2주차: 수집과 중복 제거

완료 기준: `npm run dry`를 두 번 연속 실행하면 두 번째에는 신규 0건으로 표시된다. (dry에서도 seen 비교는 하되 저장만 안 함 → 테스트용으로 `--save-seen` 플래그 허용)

- [x] [사용자] 사람인 access-key 준비 확인 (없으면 이 단계는 fixture로만 진행)
- [x] `src/collectors/saramin.ts`: 사람인 API 호출 → `Job[]` 변환. `docs/sources/saramin.md` 따름
- [x] 사람인 실제 응답 1회를 `tests/fixtures/saramin.json`으로 저장(10건 이하) + 변환 테스트
- [x] [사용자와 함께] 원티드 사전 조사: 약관·robots.txt 확인, 목록 화면의 JSON 요청 찾기. 결과를 `docs/sources/wanted.md`에 기록 (→ D-011: 수집 불가, 스킵)
- [x] `src/collectors/wanted.ts`: 조사 결과 방식으로 구현 → `Job[]` (D-011에 의해 스킵)
- [x] `src/store/seen.ts`: 읽기·쓰기·30일 정리 + 테스트
- [x] `index.ts`에서 수집기를 `Promise.allSettled`로 묶고, 실패·0건을 경고 목록에 담기

## 3주차: 매칭과 메일

완료 기준: 사용자 메일함에 실제 공고가 점수순으로 정리된 메일이 도착한다.

- [x] `src/match/concepts.ts`: 텍스트 정규화(대소문자·공백·점·하이픈·슬래시·가운뎃점 무시) + 동의어 사전으로 개념 추출 (2글자 이하 영문 약어는 단어 경계 매칭) + 테스트
- [x] `src/match/rules.ts`: 트랙별 통과 판정(must_any·must_all·exclude_concepts·경력 한도·watch_companies 우회) + 점수화 + priority 기반 트랙 선택 + 테스트
- [x] `src/match/llm.ts`: Claude 점수화, zod 검증, 재시도, 실패 시 대체 + 실패 경로 테스트(SDK 모킹)
- [x] `src/mail/DailyReport.tsx`: React Email 템플릿, 트랙별 섹션 (SPEC 6장 구성). `npm run email:dev`로 미리보기
- [x] `src/mail/send.ts`: Resend 발송. dry-run이면 HTML 파일로 저장
- [ ] [사용자] `npm start`로 첫 실제 발송 확인

## 4주차: 자동화와 튜닝

완료 기준: 7일 연속, 사람 손 없이 메일이 도착한다.

- [ ] `.github/workflows/daily.yml` 작성 (cron + workflow_dispatch + seen.json 커밋). 러너에 `npm install -g @anthropic-ai/claude-code`로 CLI 설치 + `CLAUDE_CODE_OAUTH_TOKEN` env 전달 포함
- [ ] [사용자] GitHub Secrets 등록, Actions 쓰기 권한 설정, 수동 실행으로 테스트
- [ ] 원티드가 Actions 환경에서 차단되는지 확인. 차단되면 DECISIONS.md에 대응 기록
- [ ] 메일 상단 경고 영역이 실제 실패 상황에서 뜨는지 확인 (키를 일부러 틀려서 테스트)
- [ ] `npm run vocab`: 사전에 없는 자주 나오는 표현 상위 50개 + LLM `newTerms`를 `out/vocab.md`로 출력
- [ ] [사용자] 7일간 받아보며 좋았던/별로였던 공고 기록, `out/vocab.md` 보고 `synonyms` 보강 → `profile.yaml`·`llm_focus` 튜닝

## 확장 (MVP 이후)

- [ ] 잡코리아 수집기
- [ ] 메일의 좋아요/별로 피드백 수집
- [ ] 마감 3일 전 리마인드
- [ ] 주간 "자주 나오는 스택" 통계
- [ ] Supabase + React 대시보드

## 작업 기록

| 날짜 | 항목 | 확인 방법 |
| --- | --- | --- |
| 2026-10-13 | 사람인 API 이용신청 | 신청 완료 (사용자) |
| 2026-10-15 | 1주차: 프로젝트 초기화 | `npm run typecheck && npm test && npm run lint` 모두 통과 |
| 2026-10-15 | 1주차: src/types.ts | typecheck 통과, 12개 테스트 통과 |
| 2026-10-15 | 1주차: src/config.ts | typecheck 통과, 8개 테스트 통과 (총 20개) |
| 2026-10-15 | 1주차: src/index.ts + out/preview.html | `npm run dry` 성공, 9개 테스트 통과 (총 29개) |
| 2026-10-15 | 2주차: src/collectors/saramin.ts | typecheck 통과, 13개 테스트 통과 (총 42개), fixture로만 진행 |
| 2026-10-15 | 2주차: src/store/seen.ts + index.ts allSettled 연결 | `npm run dry --save-seen` 후 `npm run dry` → 신규 0건. typecheck 통과, 53개 테스트 통과 |
| 2026-10-15 | 3주차: src/match/concepts.ts | typecheck 통과, 78개 테스트 통과 (+25). FE·IT 오탐 방지 포함 |
| 2026-10-15 | 3주차: src/match/rules.ts | typecheck 통과, 104개 테스트 통과 (+26). must_any·must_all·exclude_concepts·watch_companies 포함 |
| 2026-10-15 | 3주차: src/match/llm.ts | typecheck 통과, 114개 테스트 통과 (+10). child_process·rmSync Windows 충돌 → 동적 import + rmdirSync로 해결 |
| 2026-10-15 | 3주차: src/mail/DailyReport.tsx | typecheck 통과, 114개 테스트 통과. tsconfig에 types:node 추가(React 패키지 설치 후 자동탐지 깨짐) |
| 2026-10-15 | 3주차: src/mail/send.ts + index.ts 실제 파이프라인 연결 | `npm run dry` → out/preview.html 생성 확인. typecheck + 114개 테스트 통과 |
