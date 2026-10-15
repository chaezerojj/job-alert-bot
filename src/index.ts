import { mkdirSync, writeFileSync } from 'fs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { loadConfig } from './config';
import type { Config } from './config';
import type { Job, ScoredJob } from './types';
import { collectSaramin } from './collectors/saramin';
import { loadSeen, saveSeen, filterNew, addEntries } from './store/seen';
import { renderPreviewHtml } from './mail/preview';

const isDryRun = process.argv.includes('--dry-run');
const doSaveSeen = process.argv.includes('--save-seen');
const SEEN_PATH = 'data/seen.json';

// 2주차까지 사용하는 스켈레톤용 가짜 공고
const FAKE_JOBS: ScoredJob[] = [
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
    postedAt: '2026-10-15T08:00:00+09:00',
  },
  {
    id: 'saramin:20001',
    source: 'saramin',
    title: '신입 프론트엔드 엔지니어',
    company: '테스트스타트업B',
    url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=20001',
    techStack: ['Vue.js', 'JavaScript'],
    career: { min: 0, max: 1, label: '신입' },
    location: '서울 마포구',
    track: 'fe',
    matchedConcepts: ['frontend'],
    ruleScore: 5,
    llmScore: 62,
    reason: 'Vue.js 사용으로 React 경험과 일부 겹침. 신입 포지션.',
    matchedSkills: ['JavaScript'],
    gaps: ['Vue.js'],
  },
  {
    id: 'saramin:10002',
    source: 'saramin',
    title: '대졸 신입 공개채용 (IT개발)',
    company: '테스트대기업C',
    url: 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=10002',
    techStack: [],
    career: { min: 0, max: 0, label: '신입' },
    location: '서울',
    track: 'bigco',
    matchedConcepts: ['newgrad', 'sw_dev'],
    ruleScore: 10,
    llmScore: 78,
    reason: '신입 공채. IT개발 직군 지원 가능.',
    matchedSkills: [],
    gaps: [],
    deadline: '2026-10-31T23:59:00+09:00',
  },
];

// ── 수집 ──────────────────────────────────────────────────────────────────────

async function runCollectors(config: Config, warnings: string[]): Promise<Job[]> {
  const collectors: Array<{ name: string; promise: Promise<Job[]> }> = [
    {
      name: '사람인',
      promise: config.env.saraminKey
        ? collectSaramin({ accessKey: config.env.saraminKey, tracks: config.profile.tracks })
        : Promise.reject<Job[]>(new Error('SARAMIN_ACCESS_KEY 미설정')),
    },
  ];

  const settled = await Promise.allSettled(collectors.map((c) => c.promise));
  const jobs: Job[] = [];

  settled.forEach((result, i) => {
    const name = collectors[i]?.name ?? '수집기';
    if (result.status === 'fulfilled') {
      if (result.value.length === 0) warnings.push(`${name}: 수집 결과 0건`);
      jobs.push(...result.value);
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      warnings.push(`${name} 수집 실패: ${msg}`);
    }
  });

  return jobs;
}

// ── 진입점 ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = loadConfig();
  const todayKst = dayjs.utc().add(9, 'hour').format('YYYY-MM-DD');
  const nowKst = dayjs.utc().add(9, 'hour').format('YYYY-MM-DDTHH:mm:ss+09:00');
  const seen = loadSeen(SEEN_PATH);
  const warnings: string[] = [];

  if (!isDryRun) {
    // 실제 실행: 수집 → 중복 제거 (매칭·발송은 3주차)
    const rawJobs = await runCollectors(config, warnings);
    const newJobs = filterNew(rawJobs, seen);
    if (warnings.length > 0) {
      for (const w of warnings) console.warn(`[경고] ${w}`);
    }
    console.log(`수집 ${rawJobs.length}건, 신규 ${newJobs.length}건 · 매칭·발송은 3주차 구현 예정`);
    return;
  }

  // dry-run: 가짜 공고 + seen 비교
  const displayJobs = FAKE_JOBS.filter((job) => !(job.id in seen));

  console.log(
    `job-alert-bot: ${todayKst} · 트랙 ${config.profile.tracks.length}개 · 신규 ${displayJobs.length}건`,
  );
  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`[경고] ${w}`);
  }

  const html = renderPreviewHtml({ jobs: displayJobs, date: todayKst, isDryRun, warnings });
  mkdirSync('out', { recursive: true });
  writeFileSync('out/preview.html', html, 'utf-8');
  console.log('out/preview.html 저장 완료');

  if (doSaveSeen) {
    saveSeen(SEEN_PATH, addEntries(seen, displayJobs, nowKst));
    console.log(`seen.json 갱신 완료 (${displayJobs.length}건)`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
