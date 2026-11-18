import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { Action } from '../components/Buttons';
import { Card, dateText, Message, Meta, Note, TextBox, Title, useRun } from '../components/Dept';
import { ChipRow } from '../components/controls';
import { PageError, RowItem, RowList, usePageRows } from '../components/DeptRows';
import { callLink, textLink } from '../lib/deptActions';
import type { DeptLimits } from '../lib/deptLimits';
import type { OdooClient } from '../lib/odoo';
import { ActivityRow, callbacks, Covered, finishActivity, findCustomers, logComplaint, openComplaints, readVisits, warrantyList, DAY_MS } from '../lib/odooOffice';

const open = (url: string | undefined) => url && Linking.openURL(url).catch(() => undefined);

/** Phones for customers' contacts (Odoo 19 has only `phone`). A phone Odoo won't show is left out. */
export async function phonesFor(client: Pick<OdooClient, 'call'>, partnerIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(partnerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const r = (await client.call('res.partner', 'read', [ids], { fields: ['phone'] }).catch(() => [])) as { id: number; phone?: unknown }[];
  return new Map(r.map((p) => [p.id, typeof p.phone === 'string' ? p.phone : '']));
}

/**
 * To-dos on customers (follow-ups, complaints, repairs not sold) with Mark done, and Call or Text
 * when the contact has a phone. Marking done completes the activity in Odoo.
 */
export function ActivityList({ client, load, empty, doneLabel, testID, textBody }: { client: OdooClient; load: () => Promise<ActivityRow[]>; empty: string; doneLabel: string; testID: string; textBody?: (a: ActivityRow) => string }) {
  const { data, error, reload } = usePageRows(async () => {
    const list = await load();
    return { list, phones: await phonesFor(client, list.map((a) => a.partnerId)) };
  }, [client]);
  const { msg, run } = useRun();
  const rows: RowItem[] | null = useMemo(
    () =>
      data?.list.map((a) => {
        const phone = data.phones.get(a.partnerId) ?? '';
        return {
          key: `act-${a.id}`,
          title: a.customer || 'Customer',
          sub: a.summary,
          lines: [[a.due ? `Due ${dateText(a.due)}` : '', a.who].filter(Boolean).join(' · ')].filter(Boolean),
          actions: [
            { label: doneLabel, primary: true, onPress: () => void run('done', async () => { await finishActivity(client, a.id); reload(); return `${doneLabel}: ${a.summary}`; }) },
            ...(callLink(phone) ? [{ label: 'Call', onPress: () => open(callLink(phone)) }] : []),
            ...(textBody && textLink(phone, 'x') ? [{ label: 'Text', onPress: () => open(textLink(phone, textBody(a))) }] : []),
          ],
        };
      }) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );
  if (error) return <PageError what="This list" error={error} />;
  return (
    <View style={{ gap: 10 }}>
      <Message msg={msg} />
      <RowList rows={rows} empty={empty} testID={testID} />
    </View>
  );
}

export const ComplaintsList = ({ client }: { client: OdooClient }) => <ActivityList client={client} load={() => openComplaints(client)} empty="No open complaints." doneLabel="Mark resolved" testID="complaints" />;

/** Jobs at a house that had a job just before: the same rule the Scorecard counts, now showing the jobs. */
export function CameBack({ client, limits, now = Date.now }: { client: OdooClient; limits: DeptLimits; now?: () => number }) {
  const { data, error } = usePageRows(async () => callbacks(await readVisits(client, now() - 3 * limits.callbackDays * DAY_MS), limits.callbackDays).slice(0, 50), [client, limits.callbackDays]);
  if (error) return <PageError what="Came back" error={error} />;
  const rows: RowItem[] | null = data?.map((c) => ({
    key: `back-${c.again.id}`,
    title: c.again.placeName,
    sub: `Back after ${c.gapDays} day${c.gapDays === 1 ? '' : 's'}`,
    lines: [`${c.first.name}${c.first.tech ? ` (${c.first.tech})` : ''}, ${dateText(c.first.at)}`, `then ${c.again.name}${c.again.tech ? ` (${c.again.tech})` : ''}, ${dateText(c.again.at)}`],
  })) ?? null;
  return <RowList rows={rows} empty={`No house had a second job within ${limits.callbackDays} days.`} testID="cameback" />;
}

const DUE: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
];

/** Logs a complaint as a to-do on the customer in Odoo. Nothing is saved until Save is pressed. */
export function LogComplaint({ client, now = Date.now }: { client: OdooClient; now?: () => number }) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<{ id: number; name: string }[]>([]);
  const [who, setWho] = useState<{ id: number; name: string } | null>(null);
  const [text, setText] = useState('');
  const [days, setDays] = useState(1);
  const { busy, msg, run } = useRun();
  return (
    <View style={{ gap: 10 }} testID="complaint-form">
      <Message msg={msg} />
      {who ? (
        <Card>
          <Title>{who.name}</Title>
          <Action label="Pick someone else" onPress={() => { setWho(null); setFound([]); }} />
        </Card>
      ) : (
        <Card>
          <Title>Which customer?</Title>
          <TextBox value={term} onChange={(t) => { setTerm(t); findCustomers(client, t).then(setFound, () => setFound([])); }} label="Search by name" testID="complaint-search" />
          {found.map((f) => (
            <Action key={f.id} label={f.name} onPress={() => setWho(f)} testID={`complaint-pick-${f.id}`} />
          ))}
        </Card>
      )}
      <Card>
        <Title>What happened?</Title>
        <TextBox value={text} onChange={setText} label="The complaint" testID="complaint-text" />
        <Meta>Follow up by</Meta>
        <ChipRow options={DUE.map((d) => ({ label: d.label, value: d.days }))} value={days} onChange={(v) => setDays(Number(v))} testID="complaint-due" />
      </Card>
      <Action
        label="Save complaint to Odoo"
        primary
        disabled={!who || !text.trim() || busy !== null}
        testID="complaint-save"
        onPress={() =>
          run('save', async () => {
            await logComplaint(client, who!.id, text, now() + days * DAY_MS);
            setText('');
            setWho(null);
            return `Complaint saved on ${who!.name}. It shows under Open complaints.`;
          })
        }
      />
    </View>
  );
}

/** Customers whose equipment is under warranty today, soonest ending first, with a name search. */
export function WarrantyList({ client, now = Date.now }: { client: OdooClient; now?: () => number }) {
  const { data, error } = usePageRows(() => warrantyList(client, now()), [client]);
  const [q, setQ] = useState('');
  if (error) return <PageError what="Warranty" error={error} />;
  const shown: Covered[] | null = data ? data.filter((c) => !q.trim() || `${c.customer} ${c.name}`.toLowerCase().includes(q.trim().toLowerCase())) : null;
  const rows: RowItem[] | null = shown?.map((c) => ({
    key: `war-${c.equipmentId}`,
    title: c.customer || c.name,
    sub: c.name,
    lines: [c.partsUntil ? `Parts covered until ${dateText(c.partsUntil)}` : '', c.laborUntil ? `Labor covered until ${dateText(c.laborUntil)}` : ''].filter(Boolean),
  })) ?? null;
  return (
    <View style={{ gap: 10 }}>
      <TextBox value={q} onChange={setQ} label="Search customer or item" testID="warranty-search" />
      <Note>Read from the warranty lines the app writes on each piece of equipment. Equipment sold before those lines were written is not listed.</Note>
      <RowList rows={rows} empty="No equipment is under warranty." testID="warranty" />
    </View>
  );
}
