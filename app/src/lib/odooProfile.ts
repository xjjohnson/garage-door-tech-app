/**
 * The signed-in person's employee record in Odoo (hr.employee, from the
 * Employees app): contact details, presence, tags, badges and the portal
 * certificates shown to customers. Every optional piece is read only when
 * this Odoo has it, so a missing app or field leaves that part out.
 */
import type { OdooClient } from './odoo';

type Call = Pick<OdooClient, 'call' | 'session'>;

export interface Certificate {
  id: number;
  label: string;
}

export interface Profile {
  id: number;
  name: string;
  job: string;
  email: string;
  phone: string;
  mobile: string;
  tags: string[];
  /** True when checked in, false when not, null when Odoo doesn't say. */
  present: boolean | null;
  /** Base64 picture, when there is one. */
  photo: string;
  certificates: Certificate[];
  badges: string[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

interface FieldInfo {
  type?: string;
  string?: string;
  relation?: string;
}

async function fieldsOf(c: Call, model: string): Promise<Record<string, FieldInfo>> {
  try {
    return (await c.call(model, 'fields_get', [], { attributes: ['type', 'string', 'relation'] })) as Record<string, FieldInfo>;
  } catch {
    return {};
  }
}

/** Finds the "Portal Certificates" list on the employee and reads its labels. */
async function readCertificates(c: Call, f: Record<string, FieldInfo>, employeeId: number): Promise<Certificate[]> {
  const link = Object.entries(f).find(([, i]) => i.type === 'one2many' && i.relation && /certificate/i.test(i.string ?? ''));
  if (!link) return [];
  const [name, info] = link;
  try {
    const sub = await fieldsOf(c, info.relation!);
    const labelField = Object.entries(sub).find(([k, i]) => i.type === 'char' && /label|button|^name$/i.test(`${k} ${i.string ?? ''}`))?.[0] ?? 'display_name';
    const ids = ((await c.call('hr.employee', 'read', [[employeeId]], { fields: [name] })) as Record<string, number[]>[])[0]?.[name] ?? [];
    if (!ids.length) return [];
    const rows = (await c.call(info.relation!, 'read', [ids], { fields: [labelField] })) as Record<string, unknown>[];
    return rows.map((r) => ({ id: r.id as number, label: str(r[labelField]) })).filter((r) => r.label);
  } catch {
    return [];
  }
}

async function readBadges(c: Call, f: Record<string, FieldInfo>, employeeId: number): Promise<string[]> {
  const info = f.badge_ids;
  if (!info?.relation) return [];
  try {
    const ids = ((await c.call('hr.employee', 'read', [[employeeId]], { fields: ['badge_ids'] })) as Record<string, number[]>[])[0]?.badge_ids ?? [];
    if (!ids.length) return [];
    const rows = (await c.call(info.relation, 'read', [ids], { fields: ['badge_name'] })) as Record<string, unknown>[];
    return rows.map((r) => str(r.badge_name)).filter(Boolean);
  } catch {
    return [];
  }
}

/** The signed-in user's employee record, or null when they have none. */
export async function loadProfile(c: Call): Promise<Profile | null> {
  const f = await fieldsOf(c, 'hr.employee');
  const want = ['name', 'job_title', 'work_email', 'work_phone', 'mobile_phone', 'category_ids', 'hr_presence_state', 'attendance_state', 'image_128'].filter((k) => k in f);
  const rows = (await c.call('hr.employee', 'search_read', [[['user_id', '=', c.session.uid]]], { fields: want.length ? want : ['name'], limit: 1 })) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  const id = r.id as number;
  let tags: string[] = [];
  const tagIds = Array.isArray(r.category_ids) ? (r.category_ids as number[]) : [];
  if (tagIds.length && f.category_ids?.relation) {
    try {
      const t = (await c.call(f.category_ids.relation, 'read', [tagIds], { fields: ['name'] })) as { name?: string }[];
      tags = t.map((x) => str(x.name)).filter(Boolean);
    } catch {
      tags = [];
    }
  }
  const state = str(r.attendance_state) || str(r.hr_presence_state);
  return {
    id,
    name: str(r.name),
    job: str(r.job_title),
    email: str(r.work_email),
    phone: str(r.work_phone),
    mobile: str(r.mobile_phone),
    tags,
    present: state ? state === 'checked_in' || state === 'present' : null,
    photo: str(r.image_128),
    certificates: await readCertificates(c, f, id),
    badges: await readBadges(c, f, id),
  };
}

/** Saves the contact fields back to the employee record. */
export async function saveContact(c: Call, id: number, v: { email: string; phone: string; mobile: string }): Promise<void> {
  await c.call('hr.employee', 'write', [[id], { work_email: v.email, work_phone: v.phone, mobile_phone: v.mobile }]);
}

export interface TeamHours {
  name: string;
  hours: number;
}

/** Hours each person worked in a period, from Attendances. Empty when that app isn't here. */
export async function teamHours(c: Call, fromUtc: string): Promise<TeamHours[]> {
  try {
    const rows = (await c.call('hr.attendance', 'search_read', [[['check_in', '>=', fromUtc]]], { fields: ['employee_id', 'worked_hours'], limit: 2000 })) as { employee_id: unknown; worked_hours?: number }[];
    const by = new Map<string, number>();
    for (const r of rows) {
      const n = Array.isArray(r.employee_id) ? String(r.employee_id[1]) : '';
      if (n) by.set(n, (by.get(n) ?? 0) + (r.worked_hours ?? 0));
    }
    return [...by.entries()].map(([name, hours]) => ({ name, hours })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
