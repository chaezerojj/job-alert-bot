# job-alert-bot

매일 08:00(KST)에 채용 사이트의 신규 공고를 수집하고, 내 프로필 기준으로 점수를 매겨, 상위 공고를 메일로 보내는 **개인용** 알림 봇.
서버 없이 GitHub Actions에서 실행되는 TypeScript CLI 프로젝트다. (웹 서비스 아님)

- 전체 설계: @docs/SPEC.md
- 진행 상황과 다음 할 일: @docs/ROADMAP.md
- 지금까지 내린 결정과 이유: @docs/DECISIONS.md
- 수집기 공통 규칙: @docs/sources/README.md

## 사용자와 일하는 방식

- 사용자는 비전공 프론트엔드 개발자다. React/TypeScript는 익숙하고, Node 백엔드·크롤링·CI는 이 프로젝트에서 익히는 중이다.
- 사용자는 주로 **결과를 눈으로 확인**한다. 작업이 끝나면 확인 방법을 반드시 알려준다.
  - 예: "`npm run dry` 실행 → `out/preview.html`을 브라우저로 열어 확인"
- 답변과 문서는 한국어. 코드 식별자·커밋 메시지는 영어.
- 처음 나오는 개념(예: cron, zod 스키마, git scraping)은 한두 문장으로 짧게 설명하고, 비유가 도움이 되면 비유를 쓴다.
- 한 번에 하나의 작업만 한다. 작업 단위는 @docs/ROADMAP.md 의 체크박스 하나다.
- 작업을 마치면 ROADMAP.md 체크박스를 갱신하고, 설계가 바뀌었으면 SPEC.md·DECISIONS.md도 함께 고친다.

## 명령어

```bash
npm run dry        # 수집→매칭→메일 HTML 생성까지. 메일 발송·seen.json 갱신 안 함. 결과: out/preview.html
npm start          # 실제 실행 (메일 발송 + seen.json 갱신)
npm test           # vitest 단위 테스트
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run email:dev  # React Email 미리보기 서버
```

작업을 끝내기 전에 `npm run typecheck && npm test`가 통과해야 한다.

## 폴더 구조

```text
src/
  index.ts            # 파이프라인 진입점: collect → dedupe → match → mail → save
  config.ts           # 환경변수·profile.yaml 로드 + zod 검증
  types.ts            # Job 타입과 zod 스키마 (모든 단계가 공유)
  collectors/         # 사이트별 수집기. 반드시 Job[]로 변환해서 반환
    saramin.ts
    wanted.ts
  match/
    concepts.ts       # 정규화 + 동의어 사전 → 개념 추출
    rules.ts          # 1단계 트랙별 규칙 필터 + 점수
    llm.ts            # 2단계 Claude 점수화
  store/seen.ts       # data/seen.json 읽기·쓰기
  mail/
    DailyReport.tsx   # React Email 템플릿
    send.ts           # Resend 발송
tests/
  fixtures/           # 사이트별 실제 응답 샘플 (개인정보·키 제거)
data/seen.json        # 이미 보낸 공고 기록 (Actions가 커밋)
profile.yaml          # 매칭 기준(동의어 사전 + 트랙). 사용자가 직접 관리. 에이전트는 수정 제안만 하고 직접 고치지 않는다
```

## 반드시 지킬 것

- **비밀값은 코드·로그·커밋에 절대 쓰지 않는다.** 모두 `process.env`로 읽는다. `.env`는 커밋 금지.
  - 사람인 access-key는 이용약관상 공개·공유 금지다. 로그에 URL을 찍을 때도 키를 가린다.
- 모든 외부 데이터(사이트 응답, LLM 응답, profile.yaml)는 **zod로 검증**한 뒤 사용한다.
- 수집기는 서로 독립적이어야 한다. 하나가 실패해도 나머지는 계속 돈다 (`Promise.allSettled`).
- 실패는 조용히 삼키지 않는다. 수집 실패·0건·LLM 실패는 메일 상단 "경고" 영역에 표시한다.
- LLM 점수화가 실패하면 1단계 점수로 대체해서 **메일은 반드시 나간다.**
- 크롤링 규칙(@docs/sources/README.md)을 지킨다: 하루 1회, 요청 간 2~3초 간격, 로그인 필요 페이지 금지.
- 수집 대상: 사람인(API), 원티드(크롤링), 잡코리아(2차). **고용24와 LinkedIn은 수집하지 않는다.**

## 하지 말 것

- @docs/DECISIONS.md 의 "승인된 패키지" 목록에 없는 npm 패키지는 사용자 확인 없이 추가하지 않는다. 필요하면 이유와 대안을 먼저 설명한다.
- 사이트 응답 원문을 저장소에 대량으로 커밋하지 않는다. fixture는 테스트에 필요한 몇 건만.
- `any` 타입, 비어 있는 `catch {}` 금지.
- 테스트를 통과시키려고 테스트를 지우거나 약하게 바꾸지 않는다.
- 실제 메일 발송(`npm start`)은 사용자가 요청할 때만 실행한다. 확인은 `npm run dry`로 한다.

## 코드 스타일

- ESM, `async/await`, 화살표 함수보다 이름 있는 `function` 선언 선호 (스택 트레이스 가독성).
- 날짜는 dayjs + `Asia/Seoul` 타임존으로 다룬다. `new Date()`의 로컬 시간에 의존하지 않는다.
- 파일 하나가 200줄을 넘으면 나눌지 사용자에게 제안한다.
