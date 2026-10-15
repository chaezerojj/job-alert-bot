import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { loadConfig } from './config';
import type { Config, Profile } from './config';
import type { Job } from './types';
import { collectSaramin } from './collectors/saramin';
import { loadSeen, saveSeen, filterNew, addEntries } from './store/seen';
import { applyRules } from './match/rules';
import { scoreLlm } from './match/llm';
import { sendReport } from './mail/send';

const isDryRun = process.argv.includes('--dry-run');
const doSaveSeen = process.argv.includes('--save-seen');
const SEEN_PATH = 'data/seen.json';

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

  // 1. 수집
  const rawJobs = await runCollectors(config, warnings);

  // 2. 중복 제거
  const newJobs = filterNew(rawJobs, seen);
  console.log(`수집 ${rawJobs.length}건, 신규 ${newJobs.length}건`);

  // 3. 규칙 매칭 + LLM 점수화
  const matchedJobs = applyRules(newJobs, config.profile);
  const scoredJobs = await scoreLlm(matchedJobs, config.profile, warnings);

  // 4. 메일 발송 (dry-run이면 out/preview.html 저장)
  await sendReport(
    {
      date: todayKst,
      warnings,
      jobs: scoredJobs,
      tracks: config.profile.tracks,
      maxItemsPerTrack: config.profile.mail.max_items_per_track,
      minScore: config.profile.mail.min_score,
    },
    {
      isDryRun,
      resendKey: config.env.resendKey,
      mailTo: config.env.mailTo,
      mailFrom: config.env.mailFrom,
    },
  );

  // 5. seen.json 갱신 (실제 실행 또는 --save-seen 플래그)
  if (!isDryRun || doSaveSeen) {
    saveSeen(SEEN_PATH, addEntries(seen, scoredJobs, nowKst));
    console.log(`seen.json 갱신 완료 (${scoredJobs.length}건)`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
