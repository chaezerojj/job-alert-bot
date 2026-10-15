# 설계 명세 (SPEC)

> 이 문서가 "무엇을 만드는가"의 기준이다. 구현이 이 문서와 달라지면 문서를 먼저 고친다.

## 1. 목표

매일 오전 8시(KST)에 메일 1통이 사람 손 없이 도착하고, 그 안에 내 프로필에 맞는 신규 공고가 점수순으로 정리되어 있다.

### MVP 성공 기준

- 매일 정해진 시각에 메일 1통이 자동으로 도착한다
- 같은 공고가 두 번 오지 않는다
- 메일 상위 10개 중 절반 이상이 "지원을 고민해볼 만한" 공고다
- 월 운영비가 커피 한두 잔 값 이하다

## 2. 파이프라인

```text
[GitHub Actions cron 08:00 KST]
        │
        ▼
 collect ──► dedupe ──► match(rules) ──► match(llm) ──► mail ──► save
 사이트별      seen.json    키워드 필터       Claude 점수화    React Email   seen.json
 Job[]        로 신규만     상위 30개          상위 10개        + Resend      커밋
```

각 단계는 순수 함수에 가깝게 만든다. 입력과 출력이 `Job[]` 또는 `ScoredJob[]`이라 단계별로 따로 테스트할 수 있다.

## 3. 데이터 모델

### Job (수집 직후 공통 형식)

```ts
type Job = {
  id: string;            // `${source}:${사이트 공고번호}`  예) "saramin:27614114"
  source: 'saramin' | 'wanted' | 'jobkorea';
  title: string;
  company: string;
  url: string;
  location?: string;
  career?: { min?: number; max?: number; label: string }; // 예) {min:0,max:2,label:"신입·경력 2년"}
  techStack: string[];   // 사이트가 주는 기술 태그·키워드
  description?: string;  // JD 본문. 사이트에 따라 없을 수 있음 (사람인 API는 없음)
  postedAt?: string;     // ISO 8601, KST
  deadline?: string;     // ISO 8601, KST. 상시·채용시 마감이면 undefined
};
```

### ScoredJob

```ts
type ScoredJob = Job & {
  track: string;           // 통과한 트랙 id — priority가 가장 큰 트랙, 같으면 점수 높은 트랙 (profile.yaml tracks[].id)
  matchedConcepts: string[]; // 일치한 synonyms 개념 이름
  ruleScore: number;       // 1단계 점수
  llmScore?: number;       // 0~100. LLM 실패 시 undefined
  reason?: string;         // 한 줄 이유
  matchedSkills?: string[];
  gaps?: string[];         // 부족한 요건
};
```

### data/seen.json

```json
{ "saramin:27614114": { "firstSeenAt": "2026-10-20T08:01:00+09:00", "score": 82, "sentAt": "2026-10-20T08:02:10+09:00" } }
```

- 키 = `Job.id`
- 30일 지난 항목은 정리해서 파일이 계속 커지지 않게 한다

### profile.yaml

`profile.example.yaml` 참고. 사용자가 직접 관리하고, 코드는 읽기만 한다. 로드 시 zod로 검증.

## 4. 수집

| 사이트 | 방식 | 단계 | 상세 |
| --- | --- | --- | --- |
| 사람인 | 공식 API | MVP | `docs/sources/saramin.md` |
| 원티드 | 크롤링 (내부 JSON 우선, 없으면 Playwright) | MVP | `docs/sources/wanted.md` |
| 잡코리아 | 크롤링 | 2차 | 미정 |
| 고용24, LinkedIn | 수집 안 함 | 제외 | DECISIONS.md D-002 |

`bigco` 트랙의 `watch_companies` 목록에 있는 회사는 `keywords=회사명`으로 사람인에서 1회씩 추가 검색한다 (`bbs_gb` 없이). 걸린 공고는 아래 매칭 단계에서 `must_any`·`must_all` 조건 없이 `bigco` 트랙을 통과하고 가산점(+5)을 받는다.

## 5. 매칭

### 핵심 아이디어: 단어가 아니라 "개념"으로 맞춘다

회사마다 같은 직무를 다르게 쓴다(프론트엔드 / FE / 웹 클라이언트 / UI 개발). 그래서 매칭은 두 겹이다.

1. **동의어 사전(`synonyms`)**: 공고 텍스트를 개념 이름 목록으로 바꾼다. "웹 클라이언트 개발" → `frontend`
2. **트랙(`tracks`)**: 개념 이름으로 통과 조건·가산점을 정한다. 새 표현이 나오면 사전에만 추가하면 된다

사전에 없는 표현까지 완벽히 잡으려 하지 않는다. 규칙 필터는 넓게 통과시키고, 의미 판단은 2단계 LLM이 한다.

### 1단계: 규칙 필터 (`src/match/rules.ts`, `src/match/concepts.ts`)

1. `seen.json`에 있는 id 제외
2. 제목·경력·키워드에 공통 `exclude_keywords`가 있으면 제외
3. 공고 텍스트(제목·키워드·techStack·직무명·description)를 정규화하고 `synonyms`로 개념 목록 추출
4. 트랙마다 따로 판정:
   - 경력 하한이 트랙 `career.max`보다 크면 그 트랙 탈락
   - `must_any` 개념이 하나도 없으면 그 트랙 탈락 (단, `watch_companies`에 있는 회사면 통과)
   - `must_all` 그룹마다 하나 이상의 개념이 없으면 그 트랙 탈락 (단, `watch_companies`에 있는 회사면 통과)
   - `exclude_concepts` 중 하나라도 있으면 그 트랙 탈락
   - 점수 = `boost` 개념 점수 합 + `newgrad` 개념이면 +2 + `watch_companies`면 +5
5. 통과한 트랙 중 `priority`가 가장 큰 트랙을 `ScoredJob.track`으로 정한다. `priority`가 같으면 점수가 높은 트랙으로 정한다.
6. 트랙별 상위 15개, 전체 최대 40개만 2단계로 넘긴다

정규화: 소문자로, 공백·점(`.`)·하이픈·슬래시·가운뎃점(`·`) 제거. `React.js` = `reactjs` = `REACT JS`.
2글자 이하 영문 약어(`FE`, `AX`, `DX`, `TS`, `JS`, `IT`)는 **단어 경계**로만 매칭한다 (`FEED`, `MAX`, `ITEM` 오탐 방지).

### 동의어 사전 보강 (`npm run vocab`)

사전을 처음부터 완벽히 쓰려 하지 않는다. 데이터를 보고 키운다.

- `npm run vocab`: 최근 수집된 공고의 제목·키워드에서 자주 나오는 표현을 세고, **아직 사전에 없는 표현** 상위 50개를 `out/vocab.md`로 출력
- 사용자가 보고 쓸 만한 표현을 `profile.yaml`의 `synonyms`에 직접 추가한다 (자동 추가하지 않음)
- 2단계 LLM 응답에 `newTerms`(사전에 없지만 판단에 쓴 표현)를 함께 받아서 `out/vocab.md`에 같이 모은다

### 2단계: LLM 점수화 (`src/match/llm.ts`)

- 실행: `child_process`로 `claude -p` CLI 호출 (`@anthropic-ai/sdk` 사용 안 함. 변경됨 → D-010)
- 한 번의 호출에 후보 공고를 묶어서 보낸다 (공고당 1호출 X)
- 각 공고에 1단계에서 정한 `track`을 붙여 보내고, 그 트랙의 `llm_focus` 기준으로 채점하게 한다
- 출력: `--output-format json --json-schema '<스키마>'` → `result.structured_output` 파싱 → zod 검증
  - 스키마: `[{ id, score, reason, matchedSkills, gaps, newTerms }]`
- 프로젝트 CLAUDE.md·hooks·MCP 서버가 로딩되지 않도록 **빈 임시 폴더를 작업 디렉터리로** 실행
- `--permission-mode dontAsk` 추가 → 도구 호출 차단
- `--bare`는 쓰지 않는다 — bare 모드는 구독 토큰을 읽지 않아 `ANTHROPIC_API_KEY`가 별도로 필요해짐
- 실패(한도 초과·인증 만료·타임아웃) → 1회 재시도 → 그래도 실패면 1단계 점수로 대체하고 경고 표시
- description이 없는 공고는 제목·키워드·직무명만으로 판단하라고 프롬프트에 명시

```bash
# 빈 임시 디렉터리에서 실행해야 프로젝트 CLAUDE.md·hooks가 로딩되지 않는다
claude -p "<프롬프트>" \
  --output-format json \
  --json-schema '<스키마 JSON 문자열>' \
  --permission-mode dontAsk
```

프롬프트 뼈대:

```text
너는 신입 개발자의 채용 공고 큐레이터다.
[프로필]을 기준으로 각 [공고]의 적합도를 0~100점으로 매겨라.
공고마다 붙은 track의 [채점 기준]을 우선 적용하라.
경력 요건이 프로필보다 높으면 크게 감점하고,
지원자가 이미 가진 경험과 겹치는 부분을 근거로 들어라.
사전에 없는 직무 표현인데 판단에 중요했던 단어는 newTerms에 담아라.
JD 본문이 없는 공고는 제목·키워드·직무명만으로 판단하고, 그 사실을 reason에 쓰지 마라.
반드시 지정한 JSON 배열만 출력하라.
```

## 6. 메일

- 제목: `[채용 알림] 10/14 신규 23건 · 추천 8건`
- 상단: 사이트별·트랙별 신규 건수, 경고(수집 실패·0건·LLM 실패)
- 본문: **트랙별 섹션**(프론트엔드 / 대기업 공채 / AX). 섹션마다 점수 상위 `max_items_per_track`개 카드 — 회사 · 직무 · 점수 · 한 줄 이유 · 겹치는 스택 · 부족한 요건 · 마감일 · 원문 링크 · 출처 사이트
- 마감 7일 이내 공고는 카드에 "D-n" 배지 (공채는 마감이 짧음)
- 하단: 컷오프 미달 공고는 제목+링크만 접어서 나열
- 신규 공고가 0건인 날도 "오늘은 신규 공고가 없습니다" 메일을 보낸다 (봇이 살아 있는지 확인용)
- `--dry-run`이면 발송 대신 `out/preview.html`로 저장

## 7. 실행 환경

- GitHub Actions, `cron: '0 23 * * *'` (UTC 23:00 = KST 08:00) + `workflow_dispatch`
- 실행이 수 분~수십 분 늦을 수 있음을 감안한다
- 실행 후 `data/seen.json`을 커밋·푸시 (`permissions: contents: write`)
- 저장소는 **비공개**

### 환경변수

| 이름 | 용도 |
| --- | --- |
| `SARAMIN_ACCESS_KEY` | 사람인 API 키 |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code 구독 토큰. `claude setup-token`으로 발급. 로컬은 `claude login` 상태면 불필요, Actions에서만 필수 |
| `RESEND_API_KEY` | Resend API 키 |
| `MAIL_TO` | 받는 메일 주소 |
| `MAIL_FROM` | 보내는 주소. 도메인 인증 전에는 Resend 기본 주소 |

## 8. 범위 밖 (지금은 안 함)

- 웹 대시보드, DB(Supabase), 다중 사용자, 공고 자동 지원
- 위 항목은 MVP가 7일 연속 안정적으로 돈 뒤에 ROADMAP의 "확장"에서 다룬다
