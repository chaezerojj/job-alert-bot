import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { z } from 'zod';
import type { Job, ScoredJob } from '../types';

dayjs.extend(utc);

// ── 스키마 ────────────────────────────────────────────────────────────────────

const SeenEntrySchema = z.object({
  firstSeenAt: z.string(),
  score: z.number(),
  sentAt: z.string(),
});

const SeenMapSchema = z.record(z.string(), SeenEntrySchema);

export type SeenEntry = z.infer<typeof SeenEntrySchema>;
export type SeenMap = z.infer<typeof SeenMapSchema>;

// ── 읽기·쓰기 ─────────────────────────────────────────────────────────────────

export function loadSeen(filePath: string): SeenMap {
  try {
    const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    return SeenMapSchema.parse(raw);
  } catch (err) {
    const isNotFound =
      err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
    if (!isNotFound) {
      console.warn(`[seen] ${filePath} 로드 실패, 빈 상태로 시작합니다.`);
    }
    return {};
  }
}

export function saveSeen(filePath: string, seen: SeenMap): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(seen, null, 2) + '\n', 'utf-8');
}

// ── 중복 제거 ─────────────────────────────────────────────────────────────────

export function filterNew(jobs: Job[], seen: SeenMap): Job[] {
  return jobs.filter((job) => !(job.id in seen));
}

// ── 발송 후 기록 추가 ─────────────────────────────────────────────────────────

export function addEntries(seen: SeenMap, jobs: ScoredJob[], nowKst: string): SeenMap {
  const updated: SeenMap = { ...seen };
  for (const job of jobs) {
    updated[job.id] = {
      firstSeenAt: nowKst,
      score: job.llmScore ?? job.ruleScore,
      sentAt: nowKst,
    };
  }
  return updated;
}

// ── 30일 지난 항목 정리 ───────────────────────────────────────────────────────

export function purgeOld(seen: SeenMap, cutoffDays = 30, now: Dayjs = dayjs.utc()): SeenMap {
  const cutoff = now.subtract(cutoffDays, 'day');
  const result: SeenMap = {};
  for (const [id, entry] of Object.entries(seen)) {
    if (dayjs(entry.firstSeenAt).valueOf() > cutoff.valueOf()) {
      result[id] = entry;
    }
  }
  return result;
}
