import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// ── Profile 스키마 ───────────────────────────────────────────────────────────

const TrackSchema = z.object({
  id: z.string(),
  label: z.string(),
  priority: z.number().int(),
  career: z
    .object({
      min: z.number().int().optional(),
      max: z.number().int().optional(),
    })
    .optional(),
  search_keywords: z.array(z.string()),
  must_any: z.array(z.string()).optional(),
  must_all: z.array(z.array(z.string())).optional(),
  exclude_concepts: z.array(z.string()).optional(),
  boost: z.record(z.string(), z.number()).optional(),
  llm_focus: z.string().optional(),
  saramin: z.object({ bbs_gb: z.number().optional() }).optional(),
  watch_companies: z.array(z.string()).optional(),
});

export const ProfileSchema = z.object({
  synonyms: z.record(z.string(), z.array(z.string())),
  tracks: z.array(TrackSchema).min(1),
  experience_summary: z.string(),
  prefer: z
    .object({ locations: z.array(z.string()).default([]) })
    .default({ locations: [] }),
  exclude_keywords: z.array(z.string()),
  mail: z.object({
    max_items_per_track: z.number().int().positive(),
    min_score: z.number().int().min(0).max(100),
  }),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Track = z.infer<typeof TrackSchema>;

// ── Env 스키마 ───────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  saraminKey: z.string().optional(),
  claudeOauthToken: z.string().optional(),
  resendKey: z.string().optional(),
  mailTo: z.string().optional(),
  mailFrom: z.string().default('onboarding@resend.dev'),
});

export type Env = z.infer<typeof EnvSchema>;

export type Config = {
  env: Env;
  profile: Profile;
};

// ── .env 로더 ────────────────────────────────────────────────────────────────
// 이미 설정된 환경변수는 덮어쓰지 않는다 (CI 환경변수 우선).

function loadDotEnv(dotEnvPath: string): void {
  try {
    const content = readFileSync(dotEnvPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const rawVal = trimmed.slice(eqIdx + 1).trim();
      const val = rawVal.replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env 없음 → process.env 그대로 사용
  }
}

// ── loadConfig ───────────────────────────────────────────────────────────────

export function loadConfig(
  options: { profilePath?: string; dotEnvPath?: string } = {},
): Config {
  const profilePath = options.profilePath ?? 'profile.yaml';
  const dotEnvPath = options.dotEnvPath ?? '.env';

  loadDotEnv(dotEnvPath);

  let rawProfile: unknown;
  try {
    rawProfile = parseYaml(readFileSync(profilePath, 'utf-8'));
  } catch {
    console.error(`[config] profile.yaml을 읽을 수 없습니다: ${profilePath}`);
    process.exit(1);
  }

  const profileResult = ProfileSchema.safeParse(rawProfile);
  if (!profileResult.success) {
    console.error('[config] profile.yaml 형식이 잘못됐습니다:');
    for (const issue of profileResult.error.issues) {
      console.error(`  ${issue.path.join('.')} — ${issue.message}`);
    }
    process.exit(1);
  }

  const env = EnvSchema.parse({
    saraminKey: process.env['SARAMIN_ACCESS_KEY'],
    claudeOauthToken: process.env['CLAUDE_CODE_OAUTH_TOKEN'],
    resendKey: process.env['RESEND_API_KEY'],
    mailTo: process.env['MAIL_TO'],
    mailFrom: process.env['MAIL_FROM'],
  });

  return { env, profile: profileResult.data };
}
