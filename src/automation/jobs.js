import {
  buildMorningBriefPayload,
  runMorningBriefJob,
  formatMorningBriefOutput,
  buildEveningWrapPayload,
  runEveningWrapJob,
  formatEveningWrapOutput,
} from './briefJobs.js';
import {
  buildApprovalDigestPayload,
  runApprovalDigestJob,
  formatApprovalDigestOutput,
  buildBlockedWorkDigestPayload,
  runBlockedWorkDigestJob,
  formatBlockedWorkDigestOutput,
  runWeeklyReviewJob,
  formatWeeklyReviewOutput,
} from './reminderJobs.js';

export const JOB_NAMES = [
  'morning_brief',
  'evening_wrap',
  'approval_digest',
  'blocked_work_digest',
  'weekly_review',
];

export const JOB_REGISTRY = {
  morning_brief: {
    buildJobPayload: buildMorningBriefPayload,
    runJob: runMorningBriefJob,
    formatJobOutput: formatMorningBriefOutput,
  },
  evening_wrap: {
    buildJobPayload: buildEveningWrapPayload,
    runJob: runEveningWrapJob,
    formatJobOutput: formatEveningWrapOutput,
  },
  approval_digest: {
    buildJobPayload: buildApprovalDigestPayload,
    runJob: runApprovalDigestJob,
    formatJobOutput: formatApprovalDigestOutput,
  },
  blocked_work_digest: {
    buildJobPayload: buildBlockedWorkDigestPayload,
    runJob: runBlockedWorkDigestJob,
    formatJobOutput: formatBlockedWorkDigestOutput,
  },
  weekly_review: {
    buildJobPayload: async () => ({ note: 'stub' }),
    runJob: runWeeklyReviewJob,
    formatJobOutput: formatWeeklyReviewOutput,
  },
};
