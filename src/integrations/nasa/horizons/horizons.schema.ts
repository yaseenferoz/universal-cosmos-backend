import { z } from 'zod';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1600-01-01' && value <= '2500-12-31';
}, 'Use a real Gregorian date between 1600 and 2500');

export const horizonsQuerySchema = z.object({
  start: calendarDate,
  stop: calendarDate,
  step: z.enum(['1h', '6h', '1d']).default('1d'),
  center: z.enum(['500@0', '500@10', '500@399']).default('500@0'),
}).strict();

export const horizonsInputSchema = horizonsQuerySchema.extend({
  // Plain IDs select major bodies; a semicolon selects a numbered asteroid, e.g. 1; = Ceres.
  targetId: z.string().regex(/^(?:[0-9]{1,9}|[1-9][0-9]{0,8};)$/),
}).superRefine((input, context) => {
  const days = (Date.parse(input.stop) - Date.parse(input.start)) / 86_400_000;
  const stepDays = { '1h': 1 / 24, '6h': 1 / 4, '1d': 1 }[input.step];
  if (!(days > 0 && days <= 366)) context.addIssue({ code: 'custom', path: ['stop'], message: 'Range must be greater than zero and at most 366 days' });
  if (Math.floor(days / stepDays) + 1 > 1000) context.addIssue({ code: 'custom', path: ['step'], message: 'Request may contain at most 1000 samples' });
});

export type HorizonsInput = z.infer<typeof horizonsInputSchema>;
