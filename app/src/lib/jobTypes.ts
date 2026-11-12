/**
 * The "What's wrong" choices on New job. This list is the starting set; from
 * 0.5.4 the list comes from Odoo (Field Service order types) and is edited
 * in Management.
 */
export const DEFAULT_JOB_TYPES = ['Broken spring', 'Off track', 'Opener', 'Tune-up', 'New door', 'Gate', 'Other'] as const;

/**
 * Whether the spring calculator prices this kind of job. Springs and new
 * doors are; openers, tune-ups, gates and the rest are quoted from Odoo
 * templates, the inspection, or lines typed by hand. A job with no type is
 * an old spring job.
 */
export const usesSprings = (what: string | undefined) => !what?.trim() || /spring|new door/i.test(what);
