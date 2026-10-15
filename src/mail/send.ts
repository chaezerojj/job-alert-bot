import { createElement } from 'react';
import { render } from '@react-email/components';
import { mkdirSync, writeFileSync } from 'fs';
import dayjs from 'dayjs';
import { Resend } from 'resend';
import { DailyReport } from './DailyReport';
import type { DailyReportProps } from './DailyReport';

export type SendOptions = {
  isDryRun: boolean;
  resendKey?: string;
  mailTo?: string;
  mailFrom?: string;
};

export async function sendReport(props: DailyReportProps, opts: SendOptions): Promise<void> {
  const html = await render(createElement(DailyReport, props));

  const totalNew = props.jobs.length;
  const recommended = props.jobs.filter(
    (j) => (j.llmScore ?? j.ruleScore) >= props.minScore,
  ).length;
  const subject = `[채용 알림] ${dayjs(props.date).format('M/D')} 신규 ${totalNew}건 · 추천 ${recommended}건`;

  if (opts.isDryRun) {
    mkdirSync('out', { recursive: true });
    writeFileSync('out/preview.html', html, 'utf-8');
    console.log(`out/preview.html 저장 완료 · ${subject}`);
    return;
  }

  if (!opts.resendKey) throw new Error('RESEND_API_KEY 미설정');
  if (!opts.mailTo) throw new Error('MAIL_TO 미설정');

  const resend = new Resend(opts.resendKey);
  const { error } = await resend.emails.send({
    from: opts.mailFrom ?? 'onboarding@resend.dev',
    to: opts.mailTo,
    subject,
    html,
  });

  if (error) throw new Error(`Resend 발송 실패: ${(error as { message?: string }).message ?? String(error)}`);
  console.log(`메일 발송 완료 · ${subject}`);
}
