---
description: 새 채용 사이트 수집기 추가 (예: /new-collector jobkorea)
---

새 수집기를 추가하려고 해. 사이트: $ARGUMENTS

@docs/sources/README.md 규칙을 따르고, 순서는 이렇게 해줘.

1. `docs/sources/$ARGUMENTS.md`가 없으면 @docs/sources/wanted.md 의 "사전 조사 체크리스트" 형식으로 먼저 만들어.
   약관·robots.txt·데이터 위치 조사는 내가 브라우저로 같이 확인할 테니, 내가 볼 것을 알려주고 멈춰.
2. 조사 결과가 채워져 있고 수집이 허용되는 경우에만 구현해:
   - `src/collectors/$ARGUMENTS.ts` (수집 + 순수 변환 함수 분리)
   - `tests/fixtures/$ARGUMENTS.*` (10건 이하, 키·개인정보 제거)
   - 변환 테스트
   - `Job.source` 타입과 SPEC.md 4장 표에 사이트 추가
   - `index.ts`의 `allSettled` 목록에 등록
3. DECISIONS.md에 이 사이트를 어떤 방식으로 수집하기로 했는지 기록해.
4. `npm run dry`로 새 사이트 공고가 `out/preview.html`에 나오는지 확인하는 방법을 알려줘.
