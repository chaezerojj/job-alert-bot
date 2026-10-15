import type { Job, ScoredJob } from '../types';
import type { Profile, Track } from '../config';
import { extractConcepts } from './concepts';

const MAX_PER_TRACK = 15;
const MAX_TOTAL = 40;

function getJobTexts(job: Job): string[] {
  return [job.title, job.techStack.join(' '), job.description ?? ''];
}

function isWatchCompany(job: Job, track: Track): boolean {
  return (track.watch_companies ?? []).some((name) => job.company.includes(name));
}

function scoreForTrack(
  job: Job,
  track: Track,
  concepts: Set<string>,
  watchCompany: boolean,
): number | null {
  // 경력 하한이 트랙 max를 초과하면 탈락
  if (
    track.career?.max !== undefined &&
    job.career?.min !== undefined &&
    job.career.min > track.career.max
  ) {
    return null;
  }

  const mustAny = track.must_any ?? [];
  const mustAll = track.must_all ?? [];
  const excludeConcepts = track.exclude_concepts ?? [];

  // must_any: watch_company면 우회
  if (!watchCompany && mustAny.length > 0) {
    if (!mustAny.some((c) => concepts.has(c))) return null;
  }

  // must_all: watch_company면 우회
  if (!watchCompany && mustAll.length > 0) {
    for (const group of mustAll) {
      if (!group.some((c) => concepts.has(c))) return null;
    }
  }

  // exclude_concepts: watch_company도 탈락
  if (excludeConcepts.some((c) => concepts.has(c))) return null;

  // 점수: boost 합 + newgrad +2 + watch_company +5
  let score = 0;
  for (const [concept, pts] of Object.entries(track.boost ?? {})) {
    if (concepts.has(concept)) score += pts;
  }
  if (concepts.has('newgrad')) score += 2;
  if (watchCompany) score += 5;

  return score;
}

/**
 * 규칙 필터 + 점수화. Job[] → ScoredJob[] (트랙별 15개, 전체 40개 상한).
 */
export function applyRules(jobs: Job[], profile: Profile): ScoredJob[] {
  const { synonyms, tracks, exclude_keywords } = profile;

  // 1. 전역 exclude_keywords 필터 (제목·경력·techStack)
  const filtered = jobs.filter((job) => {
    const searchText = [job.title, job.career?.label ?? '', job.techStack.join(' ')]
      .join(' ')
      .toLowerCase();
    return !exclude_keywords.some((kw) => searchText.includes(kw.toLowerCase()));
  });

  // 2. 공고마다 개념 추출 → 트랙 판정 → 가장 좋은 트랙 선택
  const scored: ScoredJob[] = [];

  for (const job of filtered) {
    const matchedConcepts = extractConcepts(getJobTexts(job), synonyms);
    const conceptSet = new Set(matchedConcepts);

    let bestTrack: Track | null = null;
    let bestScore = -1;

    for (const track of tracks) {
      const watchCompany = isWatchCompany(job, track);
      const score = scoreForTrack(job, track, conceptSet, watchCompany);
      if (score === null) continue;

      // priority 높은 트랙 우선, 같으면 score 높은 트랙 선택
      if (
        bestTrack === null ||
        track.priority > bestTrack.priority ||
        (track.priority === bestTrack.priority && score > bestScore)
      ) {
        bestTrack = track;
        bestScore = score;
      }
    }

    if (bestTrack !== null) {
      scored.push({ ...job, track: bestTrack.id, matchedConcepts, ruleScore: bestScore });
    }
  }

  // 3. 트랙별 상위 MAX_PER_TRACK개
  const byTrack = new Map<string, ScoredJob[]>();
  for (const job of scored) {
    const list = byTrack.get(job.track) ?? [];
    list.push(job);
    byTrack.set(job.track, list);
  }

  const limited: ScoredJob[] = [];
  for (const list of byTrack.values()) {
    limited.push(...list.sort((a, b) => b.ruleScore - a.ruleScore).slice(0, MAX_PER_TRACK));
  }

  // 4. 전체 상위 MAX_TOTAL개
  return limited.sort((a, b) => b.ruleScore - a.ruleScore).slice(0, MAX_TOTAL);
}
