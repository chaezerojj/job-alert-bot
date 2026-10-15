import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../src/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures/profile.fixture.yaml');
const invalidPath = join(__dirname, 'fixtures/profile.invalid.yaml');
const noDotEnv = join(__dirname, 'fixtures/nonexistent.env');

const ENV_KEYS = [
  'SARAMIN_ACCESS_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'RESEND_API_KEY',
  'MAIL_TO',
  'MAIL_FROM',
] as const;

let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const saved = savedEnv[key];
    if (saved !== undefined) {
      process.env[key] = saved;
    } else {
      delete process.env[key];
    }
  }
});

describe('loadConfig', () => {
  it('유효한 profile.yaml과 env로 Config를 반환한다', () => {
    const config = loadConfig({ profilePath: fixturePath, dotEnvPath: noDotEnv });
    expect(config.profile.tracks).toHaveLength(1);
    expect(config.profile.tracks[0]?.id).toBe('fe');
    expect(config.profile.synonyms['frontend']).toContain('프론트엔드');
    expect(config.profile.exclude_keywords).toContain('시니어');
    expect(config.profile.mail.max_items_per_track).toBe(5);
  });

  it('존재하지 않는 profile.yaml이면 process.exit(1)을 호출한다', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((): never => {
      throw new Error('process.exit(1) called');
    });
    expect(() =>
      loadConfig({ profilePath: 'no-such-file.yaml', dotEnvPath: noDotEnv }),
    ).toThrow('process.exit(1) called');
    mockExit.mockRestore();
  });

  it('형식이 잘못된 profile.yaml이면 process.exit(1)을 호출한다', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((): never => {
      throw new Error('process.exit(1) called');
    });
    expect(() =>
      loadConfig({ profilePath: invalidPath, dotEnvPath: noDotEnv }),
    ).toThrow('process.exit(1) called');
    mockExit.mockRestore();
  });

  it('SARAMIN_ACCESS_KEY를 env에서 읽는다', () => {
    process.env['SARAMIN_ACCESS_KEY'] = 'test-saramin-key';
    const config = loadConfig({ profilePath: fixturePath, dotEnvPath: noDotEnv });
    expect(config.env.saraminKey).toBe('test-saramin-key');
  });

  it('env 키가 없으면 optional 필드는 undefined다', () => {
    const config = loadConfig({ profilePath: fixturePath, dotEnvPath: noDotEnv });
    expect(config.env.saraminKey).toBeUndefined();
    expect(config.env.claudeOauthToken).toBeUndefined();
    expect(config.env.resendKey).toBeUndefined();
    expect(config.env.mailTo).toBeUndefined();
  });

  it('MAIL_FROM 기본값은 onboarding@resend.dev다', () => {
    const config = loadConfig({ profilePath: fixturePath, dotEnvPath: noDotEnv });
    expect(config.env.mailFrom).toBe('onboarding@resend.dev');
  });

  it('MAIL_FROM을 직접 설정하면 그 값을 사용한다', () => {
    process.env['MAIL_FROM'] = 'sender@example.com';
    const config = loadConfig({ profilePath: fixturePath, dotEnvPath: noDotEnv });
    expect(config.env.mailFrom).toBe('sender@example.com');
  });

  it('profile의 prefer.locations 기본값은 빈 배열이다', () => {
    const config = loadConfig({ profilePath: fixturePath, dotEnvPath: noDotEnv });
    expect(config.profile.prefer.locations).toEqual([]);
  });
});
