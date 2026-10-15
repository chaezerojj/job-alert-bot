# 사람인 채용공고 API

> 출처: https://oapi.saramin.co.kr/guide/job-search (2026-10-13 확인). 명세가 바뀌면 이 문서부터 고친다.

## 요약

| 항목 | 값 |
| --- | --- |
| 요청 | `GET https://oapi.saramin.co.kr/job-search` |
| 인증 | 쿼리 파라미터 `access-key` (환경변수 `SARAMIN_ACCESS_KEY`) |
| 응답 형식 | 헤더 `Accept: application/json` → JSON |
| 호출 한도 | 하루 최대 500회 |
| 1회 최대 | `count=110` |
| 조회 범위 | 진행 중인 공고만 |
| JD 본문 | **응답에 없음.** 제목·키워드·직무명·경력만 있음 |

## 우리가 쓸 요청 파라미터

| 파라미터 | 값 | 설명 |
| --- | --- | --- |
| `keywords` | profile의 검색 키워드 | 기업명·공고명·업직종 키워드·직무내용에서 검색. 여러 개는 공백/쉼표로 구분 (모두 포함하는 AND 검색이므로 키워드마다 따로 호출) |
| `job_mid_cd` / `job_cd` | 직무 코드 | 코드표: https://oapi.saramin.co.kr/guide/code-table5 |
| `loc_cd` | 지역 코드 | profile에 지역이 있을 때만. 코드표: https://oapi.saramin.co.kr/guide/code-table2 |
| `published_min` | 지난 실행 시각 근처 (Unix timestamp) | 최근 등록 공고만. 하루 1회 실행이므로 "최근 26시간" 정도 |
| `sr` | `directhire` | 헤드헌팅·파견 공고 제외 |
| `fields` | `posting-date expiration-date keyword-code` | 날짜를 사람이 읽는 형식으로도 받기 |
| `sort` | `pd` | 게시일 역순 (기본값) |
| `count` | `110` | 최대 |
| `start` | `0`부터 | 0 기반 페이지 번호. `total`을 보고 필요한 만큼만 |

### 트랙별 호출

`profile.yaml`의 트랙마다 `search_keywords`를 하나씩 호출한다. 트랙에 `saramin` 항목이 있으면 그 파라미터를 함께 붙인다.

| 트랙 | 추가 파라미터 |
| --- | --- |
| `bigco` (공채속보) | `bbs_gb=1` (공채속보만) |
| `bigco` (`watch_companies`) | `keywords=회사명` (`bbs_gb` 없이, 회사마다 1회 추가 호출) |
| 그 외 | 없음 |

같은 공고가 여러 검색어에 걸려 중복으로 올 수 있다. 수집기 안에서 `id`로 중복을 제거한 뒤 반환한다.

예상 호출 수: 트랙 3개 × 검색어 3~4개 × 최대 2페이지 = 하루 20회 안팎. 한도(500)에 여유가 많다.

## 응답 → Job 변환

```text
jobs.job[] 각 항목
  id                                   → Job.id = `saramin:${id}`
  url                                  → Job.url
  company.detail.name                  → Job.company
  position.title                       → Job.title
  position.location.name               → Job.location  (예: "서울 > 관악구,서울 > 광진구")
  position.experience-level.{min,max,name} → Job.career {min, max, label}
                                          code: 1 신입, 2 경력, 3 신입/경력, 0 경력무관
  position.job-code.name               → Job.techStack 에 쉼표 분리해서 추가
  keyword                              → Job.techStack 에 쉼표 분리해서 추가 (중복 제거)
  posting-timestamp                    → Job.postedAt (Unix 초 → KST ISO)
  expiration-timestamp + close-type    → Job.deadline
                                          close-type.code 1(접수마감일)일 때만 deadline 설정
                                          2 채용시 / 3 상시 / 4 수시 → undefined
  (JD 본문 없음)                         → Job.description = undefined
```

주의할 점:

- JSON 응답인데도 숫자가 문자열로 오는 필드가 있다 (`total`, `id`, `*-timestamp`). zod에서 `z.coerce.number()` 또는 문자열로 받기.
- `position.job-code`, `industry-keyword-code` 같은 필드는 공고에 따라 **없을 수 있다.** 전부 optional로 스키마를 잡는다.
- `url`에 utm 파라미터가 붙어 온다. 그대로 써도 된다.
- 응답 키에 하이픈이 있다 (`experience-level`). 접근은 `raw['experience-level']`.

## 에러 응답

```json
{ "code": 1, "message": "access-key를 입력해 주세요." }
```

| code | 의미 | 대응 |
| --- | --- | --- |
| 1 | access-key 미입력 | 설정 오류 → 경고 |
| 2 | 유효하지 않은 access-key | 설정 오류 → 경고 |
| 3 | 유효하지 않은 파라미터 | 버그 → 경고 + 파라미터 로그(키 제외) |
| 4 | 일일 호출 한도 초과 | 재시도하지 않음 → 경고 |
| 99 | 오류 발생 | 1회 재시도 |

성공 응답(`jobs` 있음)과 에러 응답(`code` 있음)을 zod `union`으로 구분한다.

## 이용 조건 (주의사항 페이지 요약)

- 개인 용도, 비상업. 재판매·유료화 금지.
- access-key 공개·공유 금지 → 로그·커밋·fixture에 절대 남기지 않는다.
- 사람인이 제공 주체인 것처럼 오인시키지 않는다 → 메일 카드에 "출처: 사람인"을 표시하고 원문 링크로 연결.
