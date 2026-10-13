# 로드맵 (ROADMAP)

> 에이전트는 **체크되지 않은 첫 번째 항목 하나**만 작업한다. 끝나면 체크하고, 완료 기준을 어떻게 확인했는지 한 줄 남긴다.
> 사용자가 해야 하는 일은 `[사용자]`로 표시했다. 에이전트는 이 항목을 대신하지 않고, 필요하면 사용자에게 요청한다.

## 0단계: 사전 준비

- [x] [사용자] 사람인 API 이용신청 (2026-10-13 신청, 승인 대기)
- [ ] [사용자] 사람인 승인 후 access-key 발급 → `.env`의 `SARAMIN_ACCESS_KEY`에 입력
- [ ] [사용자] Anthropic Console에서 API 키 발급, 월 사용 한도 설정
- [ ] [사용자] Resend 가입, API 키 발급
- [ ] [사용자] GitHub 비공개 저장소 생성
- [ ] [사용자] `profile.example.yaml`을 복사해 `profile.yaml` 작성 (희망 지역, 경력 범위, 제외 키워드)

## 1주차: 기반 다지기

완료 기준: `npm run dry` 실행 시 가짜 공고 3건이 `out/preview.html`에 표시된다.

- [ ] 프로젝트 초기화: `package.json`(type: module), TypeScript, tsx, ESLint, Prettier, Vitest 설정. `npm run typecheck/test/lint`가 동작
- [ ] `src/types.ts`: `Job`, `ScoredJob` zod 스키마와 타입
- [ ] `src/config.ts`: `.env`와 `profile.yaml`을 읽고 zod로 검증. 키가 없으면 어떤 키가 빠졌는지 알려주고 종료
- [ ] `src/index.ts`: 파이프라인 뼈대 + `--dry-run` 플래그. 지금은 가짜 공고 3건으로 끝까지 흐르게
- [ ] 아주 단순한 HTML로 `out/preview.html` 출력 (React Email은 3주차)

## 2주차: 수집과 중복 제거

완료 기준: `npm run dry`를 두 번 연속 실행하면 두 번째에는 신규 0건으로 표시된다. (dry에서도 seen 비교는 하되 저장만 안 함 → 테스트용으로 `--save-seen` 플래그 허용)

- [ ] [사용자] 사람인 access-key 준비 확인 (없으면 이 단계는 fixture로만 진행)
- [ ] `src/collectors/saramin.ts`: 사람인 API 호출 → `Job[]` 변환. `docs/sources/saramin.md` 따름
- [ ] 사람인 실제 응답 1회를 `tests/fixtures/saramin.json`으로 저장(10건 이하) + 변환 테스트
- [ ] [사용자와 함께] 원티드 사전 조사: 약관·robots.txt 확인, 목록 화면의 JSON 요청 찾기. 결과를 `docs/sources/wanted.md`에 기록
- [ ] `src/collectors/wanted.ts`: 조사 결과 방식으로 구현 → `Job[]`
- [ ] `src/store/seen.ts`: 읽기·쓰기·30일 정리 + 테스트
- [ ] `index.ts`에서 수집기를 `Promise.allSettled`로 묶고, 실패·0건을 경고 목록에 담기

## 3주차: 매칭과 메일

완료 기준: 사용자 메일함에 실제 공고가 점수순으로 정리된 메일이 도착한다.

- [ ] `src/match/aliases.ts` + `src/match/rules.ts`: 규칙 필터와 기본 점수 + 테스트
- [ ] `src/match/llm.ts`: Claude 점수화, zod 검증, 재시도, 실패 시 대체 + 실패 경로 테스트(SDK 모킹)
- [ ] `src/mail/DailyReport.tsx`: React Email 템플릿 (SPEC 6장 구성). `npm run email:dev`로 미리보기
- [ ] `src/mail/send.ts`: Resend 발송. dry-run이면 HTML 파일로 저장
- [ ] [사용자] `npm start`로 첫 실제 발송 확인

## 4주차: 자동화와 튜닝

완료 기준: 7일 연속, 사람 손 없이 메일이 도착한다.

- [ ] `.github/workflows/daily.yml` 작성 (cron + workflow_dispatch + seen.json 커밋)
- [ ] [사용자] GitHub Secrets 등록, Actions 쓰기 권한 설정, 수동 실행으로 테스트
- [ ] 원티드가 Actions 환경에서 차단되는지 확인. 차단되면 DECISIONS.md에 대응 기록
- [ ] 메일 상단 경고 영역이 실제 실패 상황에서 뜨는지 확인 (키를 일부러 틀려서 테스트)
- [ ] [사용자] 7일간 받아보며 좋았던/별로였던 공고 기록 → `profile.yaml`·프롬프트 튜닝

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
