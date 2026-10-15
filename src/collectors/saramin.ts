import { z } from 'zod';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { JobSchema } from '../types';
import type { Job } from '../types';
import type { Track } from '../config';

dayjs.extend(utc);

const BASE_URL = 'https://oapi.saramin.co.kr/job-search';
const MAX_PAGES = 5;
const DELAY_MS = 2500;

// ── Raw API 스키마 ────────────────────────────────────────────────────────────
// 숫자 필드(id, *-timestamp, experience-level.min/max)는 문자열로 오므로 coerce 사용

const ExperienceLevelSchema = z.object({
  code: z.string(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  name: z.string(),
});

export const RawJobItemSchema = z.object({
  id: z.coerce.string(),
  url: z.string(),
  company: z.object({
    detail: z.object({ name: z.string() }),
  }),
  position: z.object({
    title: z.string(),
    location: z.object({ name: z.string() }).optional(),
    'experience-level': ExperienceLevelSchema.optional(),
    'job-code': z.object({ name: z.string() }).optional(),
  }),
  keyword: z.string().optional(),
  'posting-timestamp': z.coerce.number().optional(),
  'expiration-timestamp': z.coerce.number().optional(),
  'close-type': z.object({ code: z.string() }).optional(),
});

export type RawJobItem = z.infer<typeof RawJobItemSchema>;

const SuccessBodySchema = z.object({
  jobs: z.object({
    total: z.coerce.number(),
    count: z.coerce.number(),
    start: z.coerce.number(),
    job: z.array(z.unknown()).default([]),
  }),
});

const ErrorBodySchema = z.object({
  code: z.number(),
  message: z.string(),
});

// ── Unix 초 → KST ISO ─────────────────────────────────────────────────────────

function toKstIso(unixSec: number): string {
  return dayjs.utc(unixSec * 1000).add(9, 'hour').format('YYYY-MM-DDTHH:mm:ss+09:00');
}

// ── 변환 ──────────────────────────────────────────────────────────────────────

export function toSariminJob(raw: RawJobItem): Job {
  const expLevel = raw.position['experience-level'];
  const closeCode = raw['close-type']?.code;
  const expTs = raw['expiration-timestamp'];

  const techParts: string[] = [];
  const jobCodeName = raw.position['job-code']?.name;
  if (jobCodeName) {
    techParts.push(...jobCodeName.split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (raw.keyword) {
    techParts.push(...raw.keyword.split(',').map((s) => s.trim()).filter(Boolean));
  }

  return JobSchema.parse({
    id: `saramin:${raw.id}`,
    source: 'saramin',
    title: raw.position.title,
    company: raw.company.detail.name,
    url: raw.url,
    location: raw.position.location?.name,
    career: expLevel
      ? { min: expLevel.min, max: expLevel.max, label: expLevel.name }
      : undefined,
    techStack: [...new Set(techParts)],
    postedAt:
      raw['posting-timestamp'] !== undefined
        ? toKstIso(raw['posting-timestamp'])
        : undefined,
    deadline:
      closeCode === '1' && expTs !== undefined ? toKstIso(expTs) : undefined,
  });
}

// ── 네트워크 ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(
  params: URLSearchParams,
  accessKey: string,
  signal: AbortSignal | undefined,
  retried: boolean,
): Promise<{ jobs: unknown[]; total: number }> {
  const maskedUrl = `${BASE_URL}?${params.toString()}&access-key=***`;
  const url = `${BASE_URL}?${params.toString()}&access-key=${encodeURIComponent(accessKey)}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) {
    throw new Error(`사람인 HTTP ${res.status}: ${maskedUrl}`);
  }

  const body: unknown = await res.json();

  const ok = SuccessBodySchema.safeParse(body);
  if (ok.success) {
    return { jobs: ok.data.jobs.job, total: ok.data.jobs.total };
  }

  const err = ErrorBodySchema.safeParse(body);
  if (err.success) {
    const { code, message } = err.data;
    if (code === 99 && !retried) {
      await sleep(DELAY_MS);
      return fetchPage(params, accessKey, signal, true);
    }
    throw new Error(`사람인 API 오류 ${code}: ${message}`);
  }

  throw new Error(`사람인 응답 파싱 실패: ${maskedUrl}`);
}

// ── 수집 ──────────────────────────────────────────────────────────────────────

export type SariminCollectOptions = {
  accessKey: string;
  tracks: Track[];
  maxItems?: number;
  signal?: AbortSignal;
};

export async function collectSaramin(opts: SariminCollectOptions): Promise<Job[]> {
  const { accessKey, tracks, maxItems = 100, signal } = opts;
  const seen = new Set<string>();
  const result: Job[] = [];
  let callCount = 0;

  const publishedMin = dayjs.utc().subtract(26, 'hour').unix();

  async function fetchKeyword(
    keyword: string,
    extraParams: Record<string, string>,
  ): Promise<void> {
    if (result.length >= maxItems || signal?.aborted) return;

    let start = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      if (callCount > 0) await sleep(DELAY_MS);
      callCount++;

      const params = new URLSearchParams({
        keywords: keyword,
        start: String(start),
        sort: 'pd',
        count: '110',
        sr: 'directhire',
        fields: 'posting-date expiration-date keyword-code',
        published_min: String(publishedMin),
        ...extraParams,
      });

      const { jobs, total } = await fetchPage(params, accessKey, signal, false);

      for (const rawItem of jobs) {
        const parsed = RawJobItemSchema.safeParse(rawItem);
        if (!parsed.success) continue;
        try {
          const job = toSariminJob(parsed.data);
          if (!seen.has(job.id)) {
            seen.add(job.id);
            result.push(job);
          }
        } catch (convErr) {
          const msg = convErr instanceof Error ? convErr.message : String(convErr);
          console.warn(`[saramin] 변환 실패 saramin:${parsed.data.id}: ${msg}`);
        }
      }

      start += jobs.length;
      if (start >= total || result.length >= maxItems) break;
    }
  }

  for (const track of tracks) {
    for (const keyword of track.search_keywords) {
      const extraParams: Record<string, string> = {};
      if (track.saramin?.bbs_gb !== undefined) {
        extraParams['bbs_gb'] = String(track.saramin.bbs_gb);
      }
      await fetchKeyword(keyword, extraParams);
    }
    for (const company of track.watch_companies ?? []) {
      await fetchKeyword(company, {});
    }
  }

  return result;
}
