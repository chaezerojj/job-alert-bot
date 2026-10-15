import { describe, it, expect } from 'vitest';
import { renderPreviewHtml } from '../src/mail/preview';
import type { ScoredJob } from '../src/types';

const baseJob: ScoredJob = {
  id: 'saramin:10001',
  source: 'saramin',
  title: '프론트엔드 개발자',
  company: '테스트컴퍼니',
  url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=10001',
  techStack: ['React', 'TypeScript'],
  track: 'fe',
  matchedConcepts: ['frontend'],
  ruleScore: 8,
  llmScore: 85,
  reason: '스택이 잘 맞음',
  matchedSkills: ['React'],
  gaps: ['GraphQL'],
};

describe('renderPreviewHtml', () => {
  it('유효한 HTML 문서를 반환한다', () => {
    const html = renderPreviewHtml({ jobs: [baseJob], date: '2026-10-15', isDryRun: true, warnings: [] });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang="ko">');
  });

  it('공고 제목이 포함된다', () => {
    const html = renderPreviewHtml({ jobs: [baseJob], date: '2026-10-15', isDryRun: true, warnings: [] });
    expect(html).toContain('프론트엔드 개발자');
  });

  it('llmScore를 점수로 표시한다', () => {
    const html = renderPreviewHtml({ jobs: [baseJob], date: '2026-10-15', isDryRun: false, warnings: [] });
    expect(html).toContain('85점');
  });

  it('llmScore가 없으면 ruleScore를 표시한다', () => {
    const { llmScore: _, ...noLlm } = baseJob;
    const html = renderPreviewHtml({ jobs: [noLlm], date: '2026-10-15', isDryRun: false, warnings: [] });
    expect(html).toContain('8점');
  });

  it('isDryRun이면 dry-run 배지가 표시된다', () => {
    const html = renderPreviewHtml({ jobs: [baseJob], date: '2026-10-15', isDryRun: true, warnings: [] });
    expect(html).toContain('dry-run');
  });

  it('isDryRun이 아니면 dry-run 배지가 없다', () => {
    const html = renderPreviewHtml({ jobs: [baseJob], date: '2026-10-15', isDryRun: false, warnings: [] });
    expect(html).not.toContain('dry-run');
  });

  it('경고가 있으면 경고 영역이 표시된다', () => {
    const html = renderPreviewHtml({
      jobs: [baseJob],
      date: '2026-10-15',
      isDryRun: true,
      warnings: ['사람인 수집 실패'],
    });
    expect(html).toContain('사람인 수집 실패');
    expect(html).toContain('[경고]');
  });

  it('공고가 없으면 "신규 공고가 없습니다" 메시지가 표시된다', () => {
    const html = renderPreviewHtml({ jobs: [], date: '2026-10-15', isDryRun: true, warnings: [] });
    expect(html).toContain('신규 공고가 없습니다');
  });

  it('XSS 취약 문자가 이스케이프된다', () => {
    const xssJob = { ...baseJob, title: '<script>alert(1)</script>', company: '"XSS&Test"' };
    const html = renderPreviewHtml({ jobs: [xssJob], date: '2026-10-15', isDryRun: false, warnings: [] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;XSS&amp;Test&quot;');
  });
});
