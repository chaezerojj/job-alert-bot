import { describe, it, expect } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  loadSeen,
  filterNew,
  addEntries,
  purgeOld,
} from '../src/store/seen';
import type { Job, ScoredJob } from '../src/types';

dayjs.extend(utc);

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures/seen.fixture.json');

// 테스트용 최소 Job/ScoredJob 헬퍼
function makeJob(id: string): Job {
  return {
    id,
    source: 'saramin',
    title: '테스트',
    company: '테스트컴퍼니',
    url: 'https://example.com',
    techStack: [],
  };
}

function makeScoredJob(id: string, llmScore?: number, ruleScore = 8): ScoredJob {
  return {
    ...makeJob(id),
    track: 'fe',
    matchedConcepts: [],
    ruleScore,
    llmScore,
  };
}

describe('loadSeen', () => {
  it('파일이 없으면 빈 객체를 반환한다', () => {
    expect(loadSeen('/nonexistent/path/seen.json')).toEqual({});
  });

  it('유효한 seen.json을 파싱한다', () => {
    const seen = loadSeen(fixturePath);
    expect(Object.keys(seen)).toHaveLength(2);
    expect(seen['saramin:10001']?.score).toBe(85);
  });
});

describe('filterNew', () => {
  const seen = loadSeen(fixturePath);

  it('seen에 없는 공고만 반환한다', () => {
    const jobs = [makeJob('saramin:10001'), makeJob('saramin:99999')];
    const result = filterNew(jobs, seen);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('saramin:99999');
  });

  it('모두 seen이면 빈 배열을 반환한다', () => {
    expect(filterNew([makeJob('saramin:10001')], seen)).toHaveLength(0);
  });

  it('seen이 비어 있으면 모두 반환한다', () => {
    const jobs = [makeJob('saramin:10001'), makeJob('saramin:10002')];
    expect(filterNew(jobs, {})).toHaveLength(2);
  });
});

describe('addEntries', () => {
  const now = '2026-10-15T08:00:00+09:00';

  it('새 항목을 추가한다', () => {
    const result = addEntries({}, [makeScoredJob('saramin:10003', 85)], now);
    expect(result['saramin:10003']?.score).toBe(85);
    expect(result['saramin:10003']?.firstSeenAt).toBe(now);
    expect(result['saramin:10003']?.sentAt).toBe(now);
  });

  it('llmScore가 없으면 ruleScore를 사용한다', () => {
    const result = addEntries({}, [makeScoredJob('saramin:10004', undefined, 7)], now);
    expect(result['saramin:10004']?.score).toBe(7);
  });

  it('기존 seen을 유지한다', () => {
    const existing = loadSeen(fixturePath);
    const result = addEntries(existing, [makeScoredJob('saramin:99999', 60)], now);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result['saramin:10001']?.score).toBe(85); // 기존 항목 유지
  });
});

describe('purgeOld', () => {
  // fakeNow = 2026-10-15. fixture에 saramin:10001(2026-10-14, 1일), saramin:10002(2026-09-01, 44일)
  const fakeNow = dayjs.utc('2026-10-15T00:00:00Z');

  it('30일 이상 지난 항목을 삭제한다', () => {
    const seen = loadSeen(fixturePath);
    const result = purgeOld(seen, 30, fakeNow);
    expect('saramin:10002' in result).toBe(false); // 44일 → 삭제
  });

  it('30일 이내 항목은 유지한다', () => {
    const seen = loadSeen(fixturePath);
    const result = purgeOld(seen, 30, fakeNow);
    expect('saramin:10001' in result).toBe(true); // 1일 → 유지
  });

  it('빈 seen을 입력하면 빈 객체를 반환한다', () => {
    expect(purgeOld({}, 30, fakeNow)).toEqual({});
  });
});
