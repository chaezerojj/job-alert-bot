import { z } from 'zod';

export const JobSchema = z.object({
  id: z.string(),           // `${source}:${사이트 공고번호}` 예) "saramin:27614114"
  source: z.enum(['saramin', 'wanted', 'jobkorea']),
  title: z.string(),
  company: z.string(),
  url: z.string(),
  location: z.string().optional(),
  career: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      label: z.string(),
    })
    .optional(),
  techStack: z.array(z.string()),
  description: z.string().optional(),
  postedAt: z.string().optional(),  // ISO 8601, KST
  deadline: z.string().optional(),  // ISO 8601, KST. 상시·채용시 마감이면 undefined
});

export type Job = z.infer<typeof JobSchema>;

export const ScoredJobSchema = JobSchema.extend({
  track: z.string(),
  matchedConcepts: z.array(z.string()),
  ruleScore: z.number(),
  llmScore: z.number().min(0).max(100).optional(),
  reason: z.string().optional(),
  matchedSkills: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
});

export type ScoredJob = z.infer<typeof ScoredJobSchema>;
