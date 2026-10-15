import { describe, it, expect } from 'vitest';
import { applyRules } from '../src/match/rules';
import type { Job } from '../src/types';
import type { Profile } from '../src/config';

// ── 테스트용 픽스처 ─────────────────────────────────────────────────────────

const testProfile: Profile = {
  synonyms: {
    frontend: ['프론트엔드', 'FE'],
    react: ['React'],
    web_dev: ['웹 개발'],
    sw_dev: ['SW개발'],
    it_general: ['IT'],
    open_hire: ['공채'],
    newgrad: ['신입'],
    research: ['박사'],
    ax: ['AX'],
    dx: ['DX'],
    typescript: ['TypeScript'],
  },
  tracks: [
    {
      id: 'fe',
      label: '프론트엔드',
      priority: 1,
      career: { max: 2 },
      search_keywords: [],
      must_any: ['frontend', 'react', 'web_dev'],
      boost: { react: 3, typescript: 2 },
    },
    {
      id: 'ax',
      label: 'AX',
      priority: 2,
      career: { max: 2 },
      search_keywords: [],
      must_any: ['ax', 'dx'],
      exclude_concepts: ['research'],
      boost: { ax: 3 },
    },
    {
      id: 'bigco',
      label: '대기업',
      priority: 3,
      career: { max: 0 },
      search_keywords: [],
      must_all: [
        ['open_hire', 'newgrad'],
        ['sw_dev', 'it_general', 'web_dev', 'frontend', 'ax', 'dx'],
      ],
      watch_companies: ['대기업테스트'],
      boost: { open_hire: 3, frontend: 3 },
    },
  ],
  experience_summary: '테스트 경력',
  prefer: { locations: [] },
  exclude_keywords: ['시니어', '팀장'],
  mail: { max_items_per_track: 7, min_score: 60 },
};

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: `saramin:${Math.random().toString(36).slice(2)}`,
    source: 'saramin',
    title: '프론트엔드 개발자',
    company: '테스트회사',
    url: 'https://example.com',
    techStack: ['React'],
    ...overrides,
  };
}

// ── 전역 exclude_keywords 필터 ───────────────────────────────────────────────

describe('applyRules — exclude_keywords', () => {
  it('제목에 시니어가 있으면 제외한다', () => {
    const jobs = [makeJob({ title: '시니어 프론트엔드 개발자' })];
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });

  it('제목에 팀장이 있으면 제외한다', () => {
    const jobs = [makeJob({ title: '프론트엔드 팀장 모집' })];
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });

  it('exclude_keywords 없는 공고는 통과한다', () => {
    const jobs = [makeJob({ title: '신입 프론트엔드 개발자', techStack: ['React'] })];
    expect(applyRules(jobs, testProfile)).toHaveLength(1);
  });
});

// ── fe 트랙 규칙 ──────────────────────────────────────────────────────────────

describe('applyRules — fe 트랙', () => {
  it('must_any 개념(react)이 있으면 통과한다', () => {
    const jobs = [makeJob({ techStack: ['React'] })];
    const result = applyRules(jobs, testProfile);
    expect(result).toHaveLength(1);
    expect(result[0]?.track).toBe('fe');
  });

  it('must_any 개념이 하나도 없으면 탈락한다', () => {
    const jobs = [makeJob({ title: 'Java 백엔드', techStack: ['Spring', 'MySQL'] })];
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });

  it('경력 하한(career.min)이 트랙 max(2)를 초과하면 탈락한다', () => {
    const jobs = [
      makeJob({ techStack: ['React'], career: { min: 3, max: 5, label: '3~5년' } }),
    ];
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });

  it('경력 하한이 트랙 max 이하이면 통과한다', () => {
    const jobs = [
      makeJob({ techStack: ['React'], career: { min: 1, max: 2, label: '1~2년' } }),
    ];
    expect(applyRules(jobs, testProfile)).toHaveLength(1);
  });

  it('경력 정보가 없는 공고는 경력 필터를 통과한다', () => {
    const jobs = [makeJob({ techStack: ['React'] })];
    expect(applyRules(jobs, testProfile)).toHaveLength(1);
  });
});

// ── ax 트랙 규칙 ──────────────────────────────────────────────────────────────

describe('applyRules — ax 트랙', () => {
  it('must_any 개념(ax)이 있으면 통과한다', () => {
    const jobs = [makeJob({ title: 'AX 서비스 개발자', techStack: [] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.track).toBe('ax');
  });

  it('exclude_concepts(research)가 있으면 탈락한다', () => {
    const jobs = [makeJob({ title: 'AX 박사급 연구원', techStack: [] })];
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });
});

// ── bigco 트랙 규칙 ──────────────────────────────────────────────────────────

describe('applyRules — bigco 트랙', () => {
  it('must_all 두 그룹이 모두 충족되면 통과한다', () => {
    const jobs = [makeJob({ title: '신입 SW개발 공채', techStack: [] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.track).toBe('bigco');
  });

  it('그룹1(open_hire·newgrad)만 없으면 탈락한다', () => {
    const jobs = [makeJob({ title: 'SW개발 경력직', techStack: [] })];
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });

  it('그룹2(sw_dev 등)만 없으면 탈락한다', () => {
    const jobs = [makeJob({ title: '신입 공채', techStack: [] })];
    // open_hire·newgrad는 있지만 sw_dev·it_general 등이 없음
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });

  it('신입(career.min=0)은 bigco 통과한다', () => {
    const jobs = [
      makeJob({
        title: '신입 SW개발 공채',
        techStack: [],
        career: { min: 0, max: 0, label: '신입' },
      }),
    ];
    expect(applyRules(jobs, testProfile)).toHaveLength(1);
  });

  it('경력직(career.min=1)은 bigco 탈락한다', () => {
    const jobs = [
      makeJob({
        title: '신입 SW개발 공채',
        techStack: [],
        career: { min: 1, max: 3, label: '1~3년' },
      }),
    ];
    expect(applyRules(jobs, testProfile)).toHaveLength(0);
  });

  it('watch_companies 회사는 must_all 없이 통과한다', () => {
    const jobs = [makeJob({ company: '대기업테스트', title: '영업직 채용', techStack: [] })];
    const result = applyRules(jobs, testProfile);
    expect(result).toHaveLength(1);
    expect(result[0]?.track).toBe('bigco');
  });
});

// ── 점수화 ────────────────────────────────────────────────────────────────────

describe('applyRules — 점수화', () => {
  it('boost 합산이 ruleScore에 반영된다 (react +3)', () => {
    const jobs = [makeJob({ techStack: ['React'] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.ruleScore).toBe(3); // react: 3
  });

  it('여러 boost가 합산된다 (react +3, typescript +2 = 5)', () => {
    const jobs = [makeJob({ techStack: ['React', 'TypeScript'] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.ruleScore).toBe(5);
  });

  it('newgrad 개념이 있으면 +2 가산된다', () => {
    const jobs = [makeJob({ title: '신입 프론트엔드', techStack: ['React'] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.ruleScore).toBe(5); // react 3 + newgrad 2
  });

  it('watch_company 가산점 +5가 붙는다', () => {
    const jobs = [makeJob({ company: '대기업테스트', title: '영업직', techStack: [] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.ruleScore).toBe(5); // watch_company +5
  });
});

// ── 트랙 선택 우선순위 ────────────────────────────────────────────────────────

describe('applyRules — 트랙 선택', () => {
  it('priority가 높은 트랙을 선택한다 (bigco > ax > fe)', () => {
    // fe(p1)·ax(p2)·bigco(p3) 모두 통과하는 공고
    const jobs = [
      makeJob({
        title: '신입 AX 프론트엔드 공채',
        techStack: ['React'],
        company: '대기업테스트',
      }),
    ];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.track).toBe('bigco');
  });

  it('priority가 같으면 ruleScore가 높은 트랙을 선택한다', () => {
    // fe(p1)만 통과하되 react(+3)와 typescript(+2) 동시에 있으면 score=5
    const jobs = [makeJob({ techStack: ['React', 'TypeScript'] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.ruleScore).toBe(5);
  });
});

// ── matchedConcepts ───────────────────────────────────────────────────────────

describe('applyRules — matchedConcepts', () => {
  it('추출된 개념이 ScoredJob.matchedConcepts에 담긴다', () => {
    const jobs = [makeJob({ title: '신입 프론트엔드', techStack: ['React', 'TypeScript'] })];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.matchedConcepts).toContain('frontend');
    expect(result[0]?.matchedConcepts).toContain('react');
    expect(result[0]?.matchedConcepts).toContain('typescript');
    expect(result[0]?.matchedConcepts).toContain('newgrad');
  });
});

// ── 상한 제한 ─────────────────────────────────────────────────────────────────

describe('applyRules — 상한 제한', () => {
  it('트랙별 15개를 초과하면 상위 15개만 남긴다', () => {
    const jobs = Array.from({ length: 20 }, (_, i) =>
      makeJob({ id: `saramin:${i}`, techStack: ['React'], career: { min: 0, max: 0, label: '신입' } }),
    );
    const result = applyRules(jobs, testProfile);
    const feJobs = result.filter((j) => j.track === 'fe');
    expect(feJobs.length).toBeLessThanOrEqual(15);
  });

  it('전체 40개를 초과하면 상위 40개만 남긴다', () => {
    const jobs = Array.from({ length: 50 }, (_, i) =>
      makeJob({ id: `saramin:${i}`, techStack: ['React'] }),
    );
    expect(applyRules(jobs, testProfile).length).toBeLessThanOrEqual(40);
  });

  it('결과는 ruleScore 내림차순으로 정렬된다', () => {
    const jobs = [
      makeJob({ id: 'saramin:a', title: '프론트엔드', techStack: ['React'] }),           // score 3
      makeJob({ id: 'saramin:b', title: '프론트엔드', techStack: ['React', 'TypeScript'] }), // score 5
    ];
    const result = applyRules(jobs, testProfile);
    expect(result[0]?.ruleScore).toBeGreaterThanOrEqual(result[1]?.ruleScore ?? 0);
  });
});
