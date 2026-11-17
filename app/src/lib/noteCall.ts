import { recordCall, TracedCall } from './callTrace';
import { featureOn } from './featureFlags';
import { log } from './log';

/** Called by the Odoo client after every call: feeds the trace, and the log when slow calls are being logged. */
export function noteCall(c: TracedCall) {
  if (featureOn('callTrace')) recordCall(c);
  if (c.ms > 3000 && featureOn('logSlowCalls')) log.warn('odoo', `slow call ${c.model}.${c.method} took ${c.ms} ms${c.ok ? '' : ' and failed'}`);
}
