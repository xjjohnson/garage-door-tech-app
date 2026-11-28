// First-run setup is for a phone with no saved Odoo sign-in. Tests start that
// way every time, so it is off there unless a test turns it on.
let enabled = !process.env.JEST_WORKER_ID;
export const firstRunEnabled = (): boolean => enabled;
export const setFirstRunForTests = (v: boolean) => {
  enabled = v;
};
