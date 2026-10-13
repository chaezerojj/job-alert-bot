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

## 5. 매칭

### 1단계: 규칙 필터 (`src/match/rules.ts`)

1. `seen.json`에 있는 id 제외
2. 제목·경력·키워드에 `exclude_keywords`가 있으면 제외
3. 경력 하한(`career.min`)이 프로필 `career.max`보다 크면 제외
4. 제목·키워드·techStack·description에 `skills.must` 중 하나라도 있어야 통과
5. 점수: `strong` 일치당 +3, `plus` 일치당 +1, 신입 가능 공고 +2
6. 점수 상위 30개만 2단계로 넘긴다

키워드 비교는 대소문자·공백·점(`.`) 무시. `React.js` = `react` = `ReactJS`. 별칭 표는 `src/match/aliases.ts`에 둔다.

### 2단계: LLM 점수화 (`src/match/llm.ts`)

- SDK: `@anthropic-ai/sdk`, 모델: `claude-haiku-5-5`
- 한 번의 요청에 후보 공고를 묶어서 보낸다 (공고당 1요청 X)
- system 프롬프트에 profile을 넣고 프롬프트 캐싱 적용
- 출력은 JSON 배열: `[{ id, score, reason, matchedSkills, gaps }]` → zod 검증
- 검증 실패·API 오류 → 1회 재시도 → 그래도 실패면 1단계 점수로 정렬하고 경고 표시
- description이 없는 공고는 제목·키워드·직무명만으로 판단하라고 프롬프트에 명시

프롬프트 뼈대:

```text
너는 신입 프론트엔드 개발자의 채용 공고 큐레이터다.
[프로필]을 기준으로 각 [공고]의 적합도를 0~100점으로 매겨라.
경력 요건이 프로필보다 높으면 크게 감점하고,
지원자가 이미 가진 스택과 겹치는 부분을 근거로 들어라.
JD 본문이 없는 공고는 제목·키워드·직무명만으로 판단하고, 그 사실을 reason에 쓰지 마라.
반드시 지정한 JSON 배열만 출력하라.
```

## 6. 메일

- 제목: `[채용 알림] 10/14 신규 23건 · 추천 8건`
- 상단: 사이트별 신규 건수, 경고(수집 실패·0건·LLM 실패)
- 본문: 점수 상위 최대 10개 카드 — 회사 · 직무 · 점수 · 한 줄 이유 · 겹치는 스택 · 부족한 요건 · 마감일 · 원문 링크 · 출처 사이트
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
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `RESEND_API_KEY` | Resend API 키 |
| `MAIL_TO` | 받는 메일 주소 |
| `MAIL_FROM` | 보내는 주소. 도메인 인증 전에는 Resend 기본 주소 |

## 8. 범위 밖 (지금은 안 함)

- 웹 대시보드, DB(Supabase), 다중 사용자, 공고 자동 지원
- 위 항목은 MVP가 7일 연속 안정적으로 돈 뒤에 ROADMAP의 "확장"에서 다룬다
