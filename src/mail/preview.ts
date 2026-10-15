import type { ScoredJob } from '../types';

export type PreviewData = {
  jobs: ScoredJob[];
  date: string;
  isDryRun: boolean;
  warnings: string[];
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderJobCard(job: ScoredJob, rank: number): string {
  const score = job.llmScore ?? job.ruleScore;
  const careerLabel = job.career ? ` · ${escapeHtml(job.career.label)}` : '';
  const location = job.location ? ` · ${escapeHtml(job.location)}` : '';
  const stacks = job.techStack
    .map((s) => `<span class="tag">${escapeHtml(s)}</span>`)
    .join('');
  const matched = (job.matchedSkills ?? [])
    .map((s) => `<span class="tag match">${escapeHtml(s)}</span>`)
    .join('');
  const gaps = (job.gaps ?? [])
    .map((s) => `<span class="tag gap">${escapeHtml(s)}</span>`)
    .join('');
  const reason = job.reason
    ? `<p class="reason">${escapeHtml(job.reason)}</p>`
    : '';

  return `<div class="card">
  <span class="rank">#${rank}</span>
  <div class="score">${score}점</div>
  <div class="title"><a href="${escapeHtml(job.url)}" target="_blank">${escapeHtml(job.title)}</a></div>
  <div class="meta">${escapeHtml(job.company)}${careerLabel}${location} · ${escapeHtml(job.source)}</div>
  ${reason}
  ${stacks ? `<div class="tags">기술: ${stacks}</div>` : ''}
  ${matched ? `<div class="tags">일치: ${matched}</div>` : ''}
  ${gaps ? `<div class="tags">부족: ${gaps}</div>` : ''}
</div>`;
}

export function renderPreviewHtml(data: PreviewData): string {
  const { jobs, date, isDryRun, warnings } = data;

  const warningHtml =
    warnings.length > 0
      ? `<div class="warnings"><strong>[경고]</strong><ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
      : '';

  const jobsHtml =
    jobs.length > 0
      ? jobs.map((job, i) => renderJobCard(job, i + 1)).join('\n')
      : '<p class="empty">신규 공고가 없습니다.</p>';

  const dryBadge = isDryRun
    ? ' <span class="dry-badge">dry-run</span>'
    : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>채용 알림 · ${escapeHtml(date)}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:700px;margin:2rem auto;padding:0 1rem;color:#111}
  h1{font-size:1.4rem;margin-bottom:.25rem}
  .meta-line{color:#666;font-size:.9rem;margin-bottom:1.5rem}
  .dry-badge{background:#fef3c7;color:#92400e;font-size:.75rem;padding:2px 6px;border-radius:4px;font-weight:normal;vertical-align:middle}
  .warnings{background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:.75rem 1rem;margin-bottom:1.5rem}
  .card{border:1px solid #e5e7eb;border-radius:8px;padding:1rem;margin-bottom:1rem;position:relative}
  .rank{position:absolute;top:.75rem;right:1rem;color:#9ca3af;font-size:.8rem}
  .score{font-size:1.6rem;font-weight:bold;color:#2563eb;line-height:1}
  .title{font-size:1.05rem;font-weight:600;margin:.25rem 0}
  .title a{color:#111;text-decoration:none}
  .title a:hover{text-decoration:underline}
  .meta{color:#6b7280;font-size:.85rem;margin-bottom:.5rem}
  .reason{font-size:.9rem;color:#374151;margin:.5rem 0;padding:.5rem;background:#f9fafb;border-radius:4px}
  .tags{font-size:.8rem;margin-top:.4rem}
  .tag{display:inline-block;background:#e0f2fe;color:#0369a1;padding:1px 7px;border-radius:4px;margin:0 3px 3px 0}
  .tag.match{background:#dcfce7;color:#166534}
  .tag.gap{background:#fee2e2;color:#991b1b}
  .empty{color:#6b7280;text-align:center;padding:2rem 0}
</style>
</head>
<body>
<h1>채용 알림${dryBadge}</h1>
<div class="meta-line">${escapeHtml(date)} · 신규 ${jobs.length}건</div>
${warningHtml}
${jobsHtml}
</body>
</html>`;
}
