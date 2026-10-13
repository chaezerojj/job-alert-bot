---
description: 작업 마무리 점검 (커밋 전에 실행)
---

지금까지 바꾼 내용을 커밋 전에 점검해줘. 고치지 말고 결과만 보고해.

1. `npm run typecheck`, `npm test`, `npm run lint` 실행 결과
2. 비밀값 점검: 바뀐 파일에 API 키, 메일 주소, 토큰처럼 보이는 문자열이 없는지. `.env`가 git에 올라가지 않는지
3. CLAUDE.md의 "하지 말 것" 위반 여부 (`any`, 빈 `catch`, 승인 안 된 패키지, 약해진 테스트)
4. ROADMAP.md · SPEC.md · DECISIONS.md가 실제 코드와 맞는지
5. 위 결과를 표로 정리하고, 문제가 있으면 무엇을 고치면 되는지 제안

마지막에 영어 커밋 메시지 초안을 한 줄로 제안해줘.
