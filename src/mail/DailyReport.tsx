import dayjs from 'dayjs';
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ScoredJob } from '../types';
import type { Track } from '../config';

// ── Props ─────────────────────────────────────────────────────────────────────

export type DailyReportProps = {
  date: string;           // YYYY-MM-DD (KST)
  warnings: string[];
  jobs: ScoredJob[];      // 신규 공고 전체, 점수순
  tracks: Track[];        // 트랙 정보 (label·priority)
  maxItemsPerTrack: number;
  minScore: number;
};

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function displayScore(job: ScoredJob): number {
  return job.llmScore ?? job.ruleScore;
}

function sourceLabel(source: string): string {
  if (source === 'saramin') return '사람인';
  if (source === 'wanted') return '원티드';
  if (source === 'jobkorea') return '잡코리아';
  return source;
}

function deadlineBadge(deadline: string | undefined, today: string): string | null {
  if (!deadline) return null;
  const diff = dayjs(deadline).diff(dayjs(today), 'day');
  if (diff < 0 || diff > 7) return null;
  return `D-${diff}`;
}

// ── 서브컴포넌트 ──────────────────────────────────────────────────────────────

function JobCard({ job, today }: { job: ScoredJob; today: string }) {
  const score = displayScore(job);
  const badge = deadlineBadge(job.deadline, today);

  return (
    <Section style={cardStyle}>
      <Text style={cardTitleStyle}>
        <Link href={job.url} style={cardLinkStyle}>
          {job.company} · {job.title}
        </Link>
        {badge !== null && (
          <span style={badgeStyle}> {badge}</span>
        )}
      </Text>
      <Text style={metaStyle}>
        점수 {score} &nbsp;·&nbsp; {job.career?.label ?? '경력 무관'} &nbsp;·&nbsp; {sourceLabel(job.source)}
      </Text>
      {job.reason !== undefined && job.reason.length > 0 && (
        <Text style={reasonStyle}>{job.reason}</Text>
      )}
      {job.matchedSkills !== undefined && job.matchedSkills.length > 0 && (
        <Text style={metaStyle}>보유: {job.matchedSkills.join(', ')}</Text>
      )}
      {job.gaps !== undefined && job.gaps.length > 0 && (
        <Text style={metaStyle}>부족: {job.gaps.join(', ')}</Text>
      )}
      {job.deadline !== undefined && (
        <Text style={metaStyle}>
          마감: {dayjs(job.deadline).format('YYYY-MM-DD')}
        </Text>
      )}
    </Section>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function DailyReport({
  date,
  warnings,
  jobs,
  tracks,
  maxItemsPerTrack,
  minScore,
}: DailyReportProps) {
  const totalNew = jobs.length;
  const recommended = jobs.filter((j) => displayScore(j) >= minScore).length;
  const subject = `[채용 알림] ${dayjs(date).format('M/D')} 신규 ${totalNew}건 · 추천 ${recommended}건`;

  // 트랙별 분류 (priority 내림차순)
  const trackMap = new Map<string, ScoredJob[]>();
  for (const job of jobs) {
    const list = trackMap.get(job.track) ?? [];
    list.push(job);
    trackMap.set(job.track, list);
  }

  const sortedTracks = [...tracks].sort((a, b) => b.priority - a.priority);
  const mainByTrack: Array<{ track: Track; jobs: ScoredJob[] }> = [];
  const cutoffJobs: ScoredJob[] = [];

  for (const track of sortedTracks) {
    const trackJobs = (trackMap.get(track.id) ?? []).sort(
      (a, b) => displayScore(b) - displayScore(a),
    );
    const main: ScoredJob[] = [];
    for (const job of trackJobs) {
      if (displayScore(job) >= minScore && main.length < maxItemsPerTrack) {
        main.push(job);
      } else {
        cutoffJobs.push(job);
      }
    }
    if (main.length > 0) mainByTrack.push({ track, jobs: main });
  }

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>

          {/* 헤더 */}
          <Section style={headerStyle}>
            <Heading style={h1Style}>{subject}</Heading>
            <Text style={subtitleStyle}>{date} (KST) 기준</Text>
          </Section>

          {/* 경고 */}
          {warnings.length > 0 && (
            <Section style={warningBoxStyle}>
              {warnings.map((w, i) => (
                <Text key={i} style={warningTextStyle}>[경고] {w}</Text>
              ))}
            </Section>
          )}

          {/* 신규 0건 */}
          {totalNew === 0 && (
            <Section style={emptyStyle}>
              <Text style={emptyTextStyle}>오늘은 신규 공고가 없습니다.</Text>
              <Text style={subtitleStyle}>봇은 정상 동작 중입니다.</Text>
            </Section>
          )}

          {/* 트랙별 섹션 */}
          {mainByTrack.map(({ track, jobs: trackJobs }) => (
            <Section key={track.id}>
              <Heading as="h2" style={h2Style}>{track.label}</Heading>
              {trackJobs.map((job) => (
                <JobCard key={job.id} job={job} today={date} />
              ))}
              <Hr style={hrStyle} />
            </Section>
          ))}

          {/* 컷오프 미달 */}
          {cutoffJobs.length > 0 && (
            <Section>
              <Heading as="h3" style={h3Style}>
                컷오프 미달 ({cutoffJobs.length}건 · 점수 {minScore} 미만 또는 트랙 초과)
              </Heading>
              {cutoffJobs.map((job) => (
                <Text key={job.id} style={cutoffItemStyle}>
                  · <Link href={job.url} style={cutoffLinkStyle}>{job.company} — {job.title}</Link>
                </Text>
              ))}
            </Section>
          )}

        </Container>
      </Body>
    </Html>
  );
}

// ── 인라인 스타일 ─────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f5f5f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  padding: '24px',
};

const headerStyle: React.CSSProperties = {
  borderBottom: '2px solid #1a1a1a',
  paddingBottom: '16px',
  marginBottom: '16px',
};

const h1Style: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#1a1a1a',
  margin: '0 0 4px',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#666',
  margin: 0,
};

const warningBoxStyle: React.CSSProperties = {
  backgroundColor: '#fff3cd',
  border: '1px solid #f0ad4e',
  borderRadius: '4px',
  padding: '12px',
  marginBottom: '16px',
};

const warningTextStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#856404',
  margin: '0 0 4px',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 0',
};

const emptyTextStyle: React.CSSProperties = {
  fontSize: '16px',
  color: '#333',
};

const h2Style: React.CSSProperties = {
  fontSize: '17px',
  fontWeight: 700,
  color: '#1a1a1a',
  borderLeft: '4px solid #0070f3',
  paddingLeft: '10px',
  margin: '24px 0 12px',
};

const h3Style: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#666',
  margin: '24px 0 8px',
};

const hrStyle: React.CSSProperties = {
  borderTop: '1px solid #e5e5e5',
  margin: '16px 0',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: '6px',
  padding: '12px 16px',
  marginBottom: '10px',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  margin: '0 0 4px',
};

const cardLinkStyle: React.CSSProperties = {
  color: '#0070f3',
  textDecoration: 'none',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#e53e3e',
  color: '#ffffff',
  fontSize: '11px',
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: '3px',
  marginLeft: '6px',
};

const metaStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  margin: '0 0 2px',
};

const reasonStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#333',
  margin: '4px 0',
  fontStyle: 'italic',
};

const cutoffItemStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#666',
  margin: '0 0 3px',
};

const cutoffLinkStyle: React.CSSProperties = {
  color: '#666',
  textDecoration: 'none',
};

// ── 기본 내보내기 (react-email dev 서버용) ────────────────────────────────────

const previewData: DailyReportProps = {
  date: '2026-10-15',
  warnings: ['사람인: 수집 결과 0건'],
  jobs: [
    {
      id: 'saramin:10001',
      source: 'saramin',
      title: '프론트엔드 개발자 (React/TypeScript)',
      company: '테스트컴퍼니A',
      url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=10001',
      techStack: ['React', 'TypeScript', 'Next.js'],
      career: { min: 0, max: 2, label: '신입·경력 2년' },
      location: '서울 강남구',
      track: 'fe',
      matchedConcepts: ['frontend', 'react', 'typescript'],
      ruleScore: 8,
      llmScore: 85,
      reason: 'React + TypeScript 스택이 프로필과 일치. 경력 요건도 적합.',
      matchedSkills: ['React', 'TypeScript', 'Next.js'],
      gaps: [],
    },
    {
      id: 'saramin:10002',
      source: 'saramin',
      title: '대졸 신입 공개채용 (IT개발)',
      company: '테스트대기업C',
      url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=10002',
      techStack: [],
      career: { min: 0, max: 0, label: '신입' },
      track: 'bigco',
      matchedConcepts: ['newgrad', 'sw_dev'],
      ruleScore: 10,
      llmScore: 78,
      reason: '신입 공채. IT개발 직군 지원 가능.',
      matchedSkills: [],
      gaps: [],
      deadline: '2026-10-31T23:59:00+09:00',
    },
    {
      id: 'saramin:20001',
      source: 'saramin',
      title: '신입 프론트엔드 엔지니어',
      company: '테스트스타트업B',
      url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=20001',
      techStack: ['Vue.js', 'JavaScript'],
      career: { min: 0, max: 1, label: '신입' },
      track: 'fe',
      matchedConcepts: ['frontend'],
      ruleScore: 5,
      llmScore: 42,
      reason: 'Vue.js 사용으로 React 경험과 일부 겹침.',
      matchedSkills: ['JavaScript'],
      gaps: ['Vue.js'],
    },
  ],
  tracks: [
    { id: 'fe', label: '프론트엔드 (스타트업·중견)', priority: 1, search_keywords: [] },
    { id: 'bigco', label: '대기업 · 공채 개발직', priority: 3, search_keywords: [] },
    { id: 'ax', label: 'AX · AI 서비스', priority: 2, search_keywords: [] },
  ],
  maxItemsPerTrack: 7,
  minScore: 60,
};

export default function DailyReportPreview() {
  return <DailyReport {...previewData} />;
}
