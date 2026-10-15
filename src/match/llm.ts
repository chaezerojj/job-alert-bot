import { mkdtempSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import type { ScoredJob } from '../types';
import type { Profile } from '../config';

// ── LLM 응답 스키마 ───────────────────────────────────────────────────────────

const LlmItemSchema = z.object({
  id: z.string(),
  score: z.number().int().min(0).max(100),
  reason: z.string(),
  matchedSkills: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  newTerms: z.array(z.string()).default([]),
});

const LlmResponseSchema = z.array(LlmItemSchema);

// claude -p --output-format json 의 결과 오브젝트. 나머지 필드는 무시
const ClaudeOutputSchema = z.object({ structured_output: z.unknown() }).passthrough();

// ── CLI 실행자 타입 (테스트에서 주입 가능) ───────────────────────────────────

export type CliExecutor = (args: string[], cwd: string) => Promise<string>;

// ── JSON 스키마 상수 ──────────────────────────────────────────────────────────

const LLM_OUTPUT_JSON_SCHEMA = JSON.stringify({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      score: { type: 'integer', minimum: 0, maximum: 100 },
      reason: { type: 'string' },
      matchedSkills: { type: 'array', items: { type: 'string' } },
      gaps: { type: 'array', items: { type: 'string' } },
      newTerms: { type: 'array', items: { type: 'string' } },
    },
    required: ['id', 'score', 'reason'],
  },
});

// ── 프롬프트 생성 ─────────────────────────────────────────────────────────────

function buildPrompt(jobs: ScoredJob[], profile: Profile): string {
  const trackIds = [...new Set(jobs.map((j) => j.track))];
  const tracks = profile.tracks.filter((t) => trackIds.includes(t.id));

  const trackCriteria = tracks
    .map((t) => `### ${t.id} (${t.label})\n${t.llm_focus ?? '적합도를 종합적으로 판단하라.'}`)
    .join('\n\n');

  const jobsData = jobs.map((job) => {
    const entry: Record<string, unknown> = {
      id: job.id,
      track: job.track,
      title: job.title,
      company: job.company,
      techStack: job.techStack,
    };
    if (job.career?.label) entry.career = job.career.label;
    if (job.description) entry.description = job.description.slice(0, 2000);
    return entry;
  });

  return `너는 신입 개발자의 채용 공고 큐레이터다.
[프로필]을 기준으로 각 [공고]의 적합도를 0~100점으로 매겨라.
공고마다 붙은 track의 [채점 기준]을 우선 적용하라.
경력 요건이 프로필보다 높으면 크게 감점하고,
지원자가 이미 가진 경험과 겹치는 부분을 근거로 들어라.
사전에 없는 직무 표현인데 판단에 중요했던 단어는 newTerms에 담아라.
JD 본문이 없는 공고는 제목·키워드·직무명만으로 판단하고, 그 사실을 reason에 쓰지 마라.
반드시 지정한 JSON 배열만 출력하라.

## 지원자 프로필
${profile.experience_summary}

## 채점 기준 (트랙별)
${trackCriteria}

## 공고 목록
${JSON.stringify(jobsData, null, 2)}`;
}

// ── CLI 호출 (재시도 1회 포함) ────────────────────────────────────────────────

async function callCli(
  prompt: string,
  executor: CliExecutor,
  tmpDir: string,
): Promise<z.infer<typeof LlmItemSchema>[]> {
  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--json-schema', LLM_OUTPUT_JSON_SCHEMA,
    '--permission-mode', 'dontAsk',
  ];

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const stdout = await executor(args, tmpDir);
      const parsed = ClaudeOutputSchema.parse(JSON.parse(stdout) as unknown);
      return LlmResponseSchema.parse(parsed.structured_output);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ── 기본 CLI 실행자 ───────────────────────────────────────────────────────────
// child_process를 모듈 레벨에서 import하면 Vitest fork worker가 Windows에서
// 크래시(STATUS_STACK_BUFFER_OVERRUN)하므로 실행 시점에 동적으로 import한다.

async function defaultExecutor(args: string[], cwd: string): Promise<string> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('claude', args, {
    cwd,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * ScoredJob[]에 LLM 점수를 채운다.
 * CLI 실패 시 warnings에 원인을 추가하고 llmScore 없이 원본 배열을 반환한다 (메일은 반드시 나간다).
 */
export async function scoreLlm(
  jobs: ScoredJob[],
  profile: Profile,
  warnings: string[],
  executor: CliExecutor = defaultExecutor,
): Promise<ScoredJob[]> {
  if (jobs.length === 0) return jobs;

  const tmpDir = mkdtempSync(join(tmpdir(), 'job-alert-llm-'));
  try {
    const results = await callCli(buildPrompt(jobs, profile), executor, tmpDir);
    const resultMap = new Map(results.map((r) => [r.id, r]));
    return jobs.map((job) => {
      const llm = resultMap.get(job.id);
      if (!llm) return job;
      return { ...job, llmScore: llm.score, reason: llm.reason, matchedSkills: llm.matchedSkills, gaps: llm.gaps };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`LLM 점수화 실패 (규칙 점수로 대체): ${msg}`);
    return jobs;
  } finally {
    rmdirSync(tmpDir);
  }
}
