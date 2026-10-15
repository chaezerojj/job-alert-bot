import { describe, it, expect } from 'vitest';
import { JobSchema, ScoredJobSchema } from '../src/types';

const baseJob = {
  id: 'saramin:12345',
  source: 'saramin' as const,
  title: '프론트엔드 개발자',
  company: '테스트 주식회사',
  url: 'https://saramin.co.kr/job/12345',
  techStack: ['React', 'TypeScript'],
};

describe('JobSchema', () => {
  it('필수 필드만 있어도 파싱된다', () => {
    const job = JobSchema.parse(baseJob);
    expect(job.id).toBe('saramin:12345');
    expect(job.source).toBe('saramin');
    expect(job.techStack).toHaveLength(2);
  });

  it('선택 필드가 없으면 undefined다', () => {
    const job = JobSchema.parse(baseJob);
    expect(job.location).toBeUndefined();
    expect(job.career).toBeUndefined();
    expect(job.description).toBeUndefined();
    expect(job.deadline).toBeUndefined();
  });

  it('career 객체가 있으면 파싱된다', () => {
    const job = JobSchema.parse({
      ...baseJob,
      career: { min: 0, max: 2, label: '신입~2년' },
    });
    expect(job.career?.label).toBe('신입~2년');
    expect(job.career?.min).toBe(0);
  });

  it('career의 min/max는 없어도 된다', () => {
    const job = JobSchema.parse({
      ...baseJob,
      career: { label: '경력무관' },
    });
    expect(job.career?.min).toBeUndefined();
  });

  it('source가 허용된 값이 아니면 실패한다', () => {
    expect(() => JobSchema.parse({ ...baseJob, source: 'linkedin' })).toThrow();
  });

  it('필수 필드(title)가 빠지면 실패한다', () => {
    const { title: _, ...noTitle } = baseJob;
    expect(() => JobSchema.parse(noTitle)).toThrow();
  });

  it('techStack이 빈 배열이어도 유효하다', () => {
    const job = JobSchema.parse({ ...baseJob, techStack: [] });
    expect(job.techStack).toHaveLength(0);
  });
});

describe('ScoredJobSchema', () => {
  const baseScored = {
    ...baseJob,
    track: 'fe',
    matchedConcepts: ['frontend', 'react'],
    ruleScore: 8,
  };

  it('필수 필드로 파싱된다', () => {
    const scored = ScoredJobSchema.parse(baseScored);
    expect(scored.track).toBe('fe');
    expect(scored.ruleScore).toBe(8);
    expect(scored.llmScore).toBeUndefined();
  });

  it('llmScore가 0~100이면 유효하다', () => {
    const scored = ScoredJobSchema.parse({ ...baseScored, llmScore: 75 });
    expect(scored.llmScore).toBe(75);
  });

  it('llmScore가 100을 초과하면 실패한다', () => {
    expect(() => ScoredJobSchema.parse({ ...baseScored, llmScore: 101 })).toThrow();
  });

  it('llmScore가 음수이면 실패한다', () => {
    expect(() => ScoredJobSchema.parse({ ...baseScored, llmScore: -1 })).toThrow();
  });

  it('Job의 모든 필드를 그대로 포함한다', () => {
    const scored = ScoredJobSchema.parse({ ...baseScored, location: '서울' });
    expect(scored.location).toBe('서울');
    expect(scored.source).toBe('saramin');
  });
});
