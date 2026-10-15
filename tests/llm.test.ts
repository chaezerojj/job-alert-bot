import { describe, it, expect } from 'vitest';
import { scoreLlm, type CliExecutor } from '../src/match/llm';
import type { ScoredJob } from '../src/types';
import type { Profile } from '../src/config';

// ── 픽스처 ───────────────────────────────────────────────────────────────────

const testProfile: Profile = {
  synonyms: { frontend: ['프론트엔드'] },
  tracks: [
    {
      id: 'fe',
      label: '프론트엔드',
      priority: 1,
      search_keywords: [],
      llm_focus: '기술 스택과 경력 요건이 맞는지를 가장 중요하게 본다.',
    },
  ],
  experience_summary: 'React 경험 1년',
  prefer: { locations: [] },
  exclude_keywords: [],
  mail: { max_items_per_track: 7, min_score: 60 },
};

function makeScoredJob(id: string): ScoredJob {
  return {
    id,
    source: 'saramin',
    title: '프론트엔드 개발자',
    company: '테스트회사',
    url: 'https://example.com',
    techStack: ['React'],
    track: 'fe',
    matchedConcepts: ['frontend'],
    ruleScore: 5,
  };
}

function makeSuccessExecutor(
  items: Array<{ id: string; score: number; reason?: string }>,
): CliExecutor {
  return async () =>
    JSON.stringify({
      structured_output: items.map((item) => ({
        id: item.id,
        score: item.score,
        reason: item.reason ?? '적합',
        matchedSkills: [],
        gaps: [],
        newTerms: [],
      })),
    });
}

// ── 성공 경로 ──────────────────────────────────────────────────────────────────

describe('scoreLlm — 성공 경로', () => {
  it('LLM 점수가 llmScore에 채워진다', async () => {
    const jobs = [makeScoredJob('saramin:1')];
    const result = await scoreLlm(jobs, testProfile, [], makeSuccessExecutor([{ id: 'saramin:1', score: 85 }]));
    expect(result[0]?.llmScore).toBe(85);
  });

  it('reason·matchedSkills·gaps가 채워진다', async () => {
    const executor: CliExecutor = async () =>
      JSON.stringify({
        structured_output: [
          {
            id: 'saramin:2',
            score: 70,
            reason: 'React 경험 일치',
            matchedSkills: ['React'],
            gaps: ['Next.js'],
            newTerms: [],
          },
        ],
      });
    const result = await scoreLlm([makeScoredJob('saramin:2')], testProfile, [], executor);
    expect(result[0]?.reason).toBe('React 경험 일치');
    expect(result[0]?.matchedSkills).toEqual(['React']);
    expect(result[0]?.gaps).toEqual(['Next.js']);
  });

  it('LLM 응답에 없는 공고는 ruleScore를 유지하고 llmScore가 없다', async () => {
    const jobs = [makeScoredJob('saramin:3'), makeScoredJob('saramin:4')];
    // saramin:3만 응답에 포함
    const result = await scoreLlm(jobs, testProfile, [], makeSuccessExecutor([{ id: 'saramin:3', score: 90 }]));
    expect(result[0]?.llmScore).toBe(90);
    expect(result[1]?.llmScore).toBeUndefined();
    expect(result[1]?.ruleScore).toBe(5);
  });

  it('빈 배열이면 CLI를 호출하지 않고 빈 배열을 반환한다', async () => {
    let called = false;
    const executor: CliExecutor = async () => {
      called = true;
      return '{}';
    };
    const result = await scoreLlm([], testProfile, [], executor);
    expect(result).toHaveLength(0);
    expect(called).toBe(false);
  });
});

// ── 실패 경로 ──────────────────────────────────────────────────────────────────

describe('scoreLlm — 실패 경로', () => {
  it('CLI 실패 시 warnings에 메시지를 추가한다', async () => {
    const failExecutor: CliExecutor = async () => { throw new Error('인증 만료'); };
    const warnings: string[] = [];
    await scoreLlm([makeScoredJob('saramin:5')], testProfile, warnings, failExecutor);
    expect(warnings[0]).toMatch(/LLM 점수화 실패/);
    expect(warnings[0]).toMatch(/인증 만료/);
  });

  it('CLI 실패 시 llmScore 없이 원본 배열을 반환한다', async () => {
    const failExecutor: CliExecutor = async () => { throw new Error('타임아웃'); };
    const result = await scoreLlm([makeScoredJob('saramin:6')], testProfile, [], failExecutor);
    expect(result).toHaveLength(1);
    expect(result[0]?.llmScore).toBeUndefined();
    expect(result[0]?.ruleScore).toBe(5);
  });

  it('2회 모두 실패한 뒤 fallback한다', async () => {
    let callCount = 0;
    const failExecutor: CliExecutor = async () => {
      callCount++;
      throw new Error('실패');
    };
    const warnings: string[] = [];
    await scoreLlm([makeScoredJob('saramin:7')], testProfile, warnings, failExecutor);
    expect(callCount).toBe(2);
    expect(warnings).toHaveLength(1);
  });

  it('1번째 실패 후 2번째 성공하면 결과를 반환한다', async () => {
    let callCount = 0;
    const retryExecutor: CliExecutor = async () => {
      callCount++;
      if (callCount === 1) throw new Error('일시적 오류');
      return JSON.stringify({
        structured_output: [
          { id: 'saramin:8', score: 75, reason: '적합', matchedSkills: [], gaps: [], newTerms: [] },
        ],
      });
    };
    const result = await scoreLlm([makeScoredJob('saramin:8')], testProfile, [], retryExecutor);
    expect(callCount).toBe(2);
    expect(result[0]?.llmScore).toBe(75);
  });

  it('JSON 파싱 실패 시 fallback한다', async () => {
    const badJsonExecutor: CliExecutor = async () => 'not valid json';
    const warnings: string[] = [];
    const result = await scoreLlm([makeScoredJob('saramin:9')], testProfile, warnings, badJsonExecutor);
    expect(result[0]?.llmScore).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it('zod 검증 실패(score 범위 초과) 시 fallback한다', async () => {
    const invalidExecutor: CliExecutor = async () =>
      JSON.stringify({
        structured_output: [{ id: 'saramin:10', score: 999, reason: '점수 오류' }],
      });
    const warnings: string[] = [];
    const result = await scoreLlm([makeScoredJob('saramin:10')], testProfile, warnings, invalidExecutor);
    expect(result[0]?.llmScore).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});
