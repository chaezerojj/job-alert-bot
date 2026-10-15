import { describe, it, expect } from 'vitest';
import { normalizeText, extractConcepts } from '../src/match/concepts';

// 테스트 전용 축소 동의어 사전
const synonyms: Record<string, string[]> = {
  frontend: ['프론트엔드', 'Front-end', 'Frontend', 'FE', '웹 클라이언트', 'UI 개발'],
  react: ['React', 'ReactJS', 'React.js', '리액트'],
  typescript: ['TypeScript', 'TS'],
  javascript: ['JavaScript', 'JS'],
  it_general: ['IT', 'ICT', '전산', 'IT/디지털'],
  ax: ['AX', 'AI Transformation'],
  newgrad: ['신입', '신입사원', '경력무관'],
};

describe('normalizeText', () => {
  it('소문자로 변환한다', () => {
    expect(normalizeText('React')).toBe('react');
    expect(normalizeText('TYPESCRIPT')).toBe('typescript');
  });

  it('공백을 제거한다', () => {
    expect(normalizeText('REACT JS')).toBe('reactjs');
    expect(normalizeText('Next JS')).toBe('nextjs');
  });

  it('점(.)을 제거한다', () => {
    expect(normalizeText('React.js')).toBe('reactjs');
    expect(normalizeText('Next.js')).toBe('nextjs');
  });

  it('하이픈을 제거한다', () => {
    expect(normalizeText('Front-end')).toBe('frontend');
  });

  it('슬래시를 제거한다', () => {
    expect(normalizeText('TypeScript/JavaScript')).toBe('typescriptjavascript');
  });

  it('가운뎃점(·)을 제거한다', () => {
    expect(normalizeText('React·JS')).toBe('reactjs');
  });

  it('React.js = REACT JS = ReactJS (정규화 후 동일)', () => {
    expect(normalizeText('React.js')).toBe(normalizeText('REACT JS'));
    expect(normalizeText('React.js')).toBe(normalizeText('ReactJS'));
  });

  it('한국어는 소문자 변환(무영향) + 공백 제거만 한다', () => {
    expect(normalizeText('프론트엔드 개발자')).toBe('프론트엔드개발자');
  });
});

describe('extractConcepts — 긴 동의어 매칭', () => {
  it('한국어 동의어를 찾는다', () => {
    expect(extractConcepts(['프론트엔드 개발자'], synonyms)).toContain('frontend');
  });

  it('React.js 를 정규화해서 react 로 찾는다', () => {
    expect(extractConcepts(['React.js 개발'], synonyms)).toContain('react');
  });

  it('Front-end 와 Frontend 를 같은 개념으로 찾는다', () => {
    expect(extractConcepts(['Front-end Developer'], synonyms)).toContain('frontend');
    expect(extractConcepts(['Frontend Developer'], synonyms)).toContain('frontend');
  });

  it('한 텍스트에서 여러 개념을 동시에 추출한다', () => {
    const result = extractConcepts(['ReactJS 프론트엔드 TypeScript'], synonyms);
    expect(result).toContain('react');
    expect(result).toContain('frontend');
    expect(result).toContain('typescript');
  });

  it('매칭되지 않으면 빈 배열을 반환한다', () => {
    expect(extractConcepts(['Java 백엔드 스프링'], synonyms)).toHaveLength(0);
  });

  it('같은 개념이 여러 동의어에 걸려도 중복 없이 반환한다', () => {
    const result = extractConcepts(['React ReactJS 리액트'], synonyms);
    expect(result.filter((c) => c === 'react')).toHaveLength(1);
  });
});

describe('extractConcepts — 짧은 영문 약어 단어 경계 매칭', () => {
  it('FE 를 단독 단어로 찾는다', () => {
    expect(extractConcepts(['FE 개발자'], synonyms)).toContain('frontend');
  });

  it('FEED 에서 FE 를 오탐하지 않는다', () => {
    expect(extractConcepts(['FEED 시스템 개발'], synonyms)).not.toContain('frontend');
  });

  it('FE개발자 (한국어와 공백 없이 붙음) 에서도 찾는다', () => {
    expect(extractConcepts(['FE개발자'], synonyms)).toContain('frontend');
  });

  it('TS/JS 를 각각 typescript, javascript 로 찾는다', () => {
    const result = extractConcepts(['TS/JS 기반 개발'], synonyms);
    expect(result).toContain('typescript');
    expect(result).toContain('javascript');
  });

  it('IT 를 단독 단어로 찾는다', () => {
    expect(extractConcepts(['IT 신입 채용'], synonyms)).toContain('it_general');
  });

  it('ITEM 에서 IT 를 오탐하지 않는다', () => {
    expect(extractConcepts(['ITEM 관리 시스템'], synonyms)).not.toContain('it_general');
  });

  it('AX인재 (한국어 붙음) 에서 AX 를 찾는다', () => {
    expect(extractConcepts(['AX인재 채용'], synonyms)).toContain('ax');
  });

  it('MAX 에서 AX 를 오탐하지 않는다', () => {
    expect(extractConcepts(['MAX 분석 담당자'], synonyms)).not.toContain('ax');
  });
});

describe('extractConcepts — 엣지 케이스', () => {
  it('빈 텍스트 배열이면 빈 결과를 반환한다', () => {
    expect(extractConcepts([], synonyms)).toHaveLength(0);
  });

  it('빈 문자열만 있어도 빈 결과를 반환한다', () => {
    expect(extractConcepts([''], synonyms)).toHaveLength(0);
  });

  it('여러 텍스트에서 각각 추출해 합산한다', () => {
    const result = extractConcepts(['프론트엔드', 'React', 'TypeScript'], synonyms);
    expect(result).toContain('frontend');
    expect(result).toContain('react');
    expect(result).toContain('typescript');
  });
});
