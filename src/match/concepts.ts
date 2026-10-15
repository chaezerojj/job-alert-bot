// 정규화: 소문자 + 공백·점·하이픈·슬래시·가운뎃점 제거
// React.js = REACT JS = ReactJS → 모두 'reactjs'
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s.\-\/·]/g, '');
}

// ≤2 자리 순수 ASCII 소문자 → 단어 경계 매칭 대상 (FE, TS, JS, IT, AX, DX …)
function isShortAbbr(normalized: string): boolean {
  return normalized.length <= 2 && /^[a-z]+$/.test(normalized);
}

/**
 * 공고 텍스트 목록에서 synonyms 기반으로 일치하는 개념 이름을 추출한다.
 *
 * - 긴 동의어: 전체 텍스트를 정규화한 문자열에서 부분 문자열 검사
 * - 짧은 약어(≤2 ASCII): 원문에서 \b단어경계\b 매칭 (FEED·MAX·ITEM 오탐 방지)
 */
export function extractConcepts(
  texts: string[],
  synonyms: Record<string, string[]>,
): string[] {
  const normalizedJoined = normalizeText(texts.join(' '));
  const matched = new Set<string>();

  for (const [concept, synList] of Object.entries(synonyms)) {
    for (const syn of synList) {
      const normSyn = normalizeText(syn);
      if (normSyn.length === 0) continue;

      let found: boolean;
      if (isShortAbbr(normSyn)) {
        const pattern = new RegExp(`\\b${normSyn}\\b`, 'i');
        found = texts.some((t) => pattern.test(t));
      } else {
        found = normalizedJoined.includes(normSyn);
      }

      if (found) {
        matched.add(concept);
        break;
      }
    }
  }

  return Array.from(matched);
}
