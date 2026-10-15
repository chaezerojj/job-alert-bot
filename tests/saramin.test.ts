import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { RawJobItemSchema, toSariminJob } from '../src/collectors/saramin';

dayjs.extend(utc);

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/saramin.json'), 'utf-8'),
) as { jobs: { job: unknown[] } };

const rawItems = fixture.jobs.job;

function kst(unixSec: number): string {
  return dayjs.utc(unixSec * 1000).add(9, 'hour').format('YYYY-MM-DDTHH:mm:ss+09:00');
}

describe('RawJobItemSchema', () => {
  it('fixture 3건을 모두 파싱한다', () => {
    expect(rawItems).toHaveLength(3);
    for (const item of rawItems) {
      expect(() => RawJobItemSchema.parse(item)).not.toThrow();
    }
  });

  it('문자열로 온 숫자 필드를 숫자로 변환한다', () => {
    const parsed = RawJobItemSchema.parse(rawItems[0]);
    expect(typeof parsed['posting-timestamp']).toBe('number');
    expect(typeof parsed.position['experience-level']?.min).toBe('number');
  });
});

describe('toSariminJob', () => {
  it('id가 saramin:{숫자} 형식이다', () => {
    const raw = RawJobItemSchema.parse(rawItems[0]);
    const job = toSariminJob(raw);
    expect(job.id).toBe('saramin:27614114');
    expect(job.source).toBe('saramin');
  });

  it('title·company·url이 올바르게 변환된다', () => {
    const raw = RawJobItemSchema.parse(rawItems[0]);
    const job = toSariminJob(raw);
    expect(job.title).toBe('프론트엔드 개발자 (React/TypeScript)');
    expect(job.company).toBe('테스트웹에이전시');
    expect(job.url).toContain('rec_idx=27614114');
  });

  it('job-code와 keyword를 합쳐 techStack을 만들고 중복을 제거한다', () => {
    const raw = RawJobItemSchema.parse(rawItems[0]);
    const job = toSariminJob(raw);
    // job-code: 웹개발자,프론트엔드개발자  keyword: React,TypeScript,React,Next.js
    expect(job.techStack).toContain('웹개발자');
    expect(job.techStack).toContain('React');
    expect(job.techStack).toContain('TypeScript');
    const reactCount = job.techStack.filter((s) => s === 'React').length;
    expect(reactCount).toBe(1); // 중복 제거
    expect(job.techStack).toHaveLength(5);
  });

  it('job-code가 없어도 keyword만으로 techStack을 만든다', () => {
    const raw = RawJobItemSchema.parse(rawItems[1]); // job-code 없음
    const job = toSariminJob(raw);
    expect(job.techStack).toContain('Java');
    expect(job.techStack).toContain('Spring');
  });

  it('close-type code=1이면 deadline을 설정한다', () => {
    const raw = RawJobItemSchema.parse(rawItems[0]);
    const job = toSariminJob(raw);
    expect(job.deadline).toBe(kst(1793228400));
    expect(job.deadline).toMatch(/\+09:00$/);
  });

  it('close-type code=2(채용시)이면 deadline이 없다', () => {
    const raw = RawJobItemSchema.parse(rawItems[1]);
    const job = toSariminJob(raw);
    expect(job.deadline).toBeUndefined();
  });

  it('close-type이 없으면 deadline이 없다', () => {
    const raw = RawJobItemSchema.parse(rawItems[2]);
    const job = toSariminJob(raw);
    expect(job.deadline).toBeUndefined();
  });

  it('posting-timestamp를 KST ISO 문자열로 변환한다', () => {
    const raw = RawJobItemSchema.parse(rawItems[0]);
    const job = toSariminJob(raw);
    expect(job.postedAt).toBe(kst(1792018800));
    expect(job.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  });

  it('location이 없으면 undefined다', () => {
    const raw = RawJobItemSchema.parse(rawItems[2]); // location 없음
    const job = toSariminJob(raw);
    expect(job.location).toBeUndefined();
  });

  it('career를 올바르게 변환한다 (경력 1~3년)', () => {
    const raw = RawJobItemSchema.parse(rawItems[2]);
    const job = toSariminJob(raw);
    expect(job.career?.min).toBe(1);
    expect(job.career?.max).toBe(3);
    expect(job.career?.label).toBe('경력 1~3년');
  });

  it('신입(code=1)의 career.min, max는 0이다', () => {
    const raw = RawJobItemSchema.parse(rawItems[0]);
    const job = toSariminJob(raw);
    expect(job.career?.min).toBe(0);
    expect(job.career?.max).toBe(0);
    expect(job.career?.label).toBe('신입');
  });
});
