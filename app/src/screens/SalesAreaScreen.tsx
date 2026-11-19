import { Linking } from 'react-native';
import { View } from 'react-native';
import { Note } from '../components/Dept';
import { DeptArea } from '../components/DeptArea';
import { PageError, RowItem, RowList, usePageRows } from '../components/DeptRows';
import type { MenuGroup } from '../components/SectionMenu';
import { callLink, textLink } from '../lib/deptActions';
import type { DeptLimits } from '../lib/deptLimits';
import type { OdooClient } from '../lib/odoo';
import { dateText } from '../components/Dept';
import { DAY_MS, flaggedRepairs, followUpsDue, lostByReason, lostQuotes, notSeenPlaces, plansAboutToRenew, quotesQuiet, quotesWaiting, wonThisMonth } from '../lib/odooOffice';
import { formatMoney } from '../lib/prices';
import { useBadges } from '../lib/useBadges';
import { useLimits } from '../lib/useLimits';
import { ActivityList, phonesFor } from './CarePages';
import { MoneyList } from './MoneyPages';
import { sp } from '../theme';

export type SalesTab = 'quiet' | 'followups' | 'open' | 'won' | 'lost' | 'renew' | 'notseen' | 'flagged';
const LABELS: Record<SalesTab, string> = {
  quiet: 'Quotes gone quiet',
  followups: 'Follow-ups due',
  open: 'Open quotes',
  won: 'Won this month',
  lost: 'Lost, and why',
  renew: 'Plans about to renew',
  notseen: 'Not seen in a while',
  flagged: 'Flagged on inspection',
};

const open = (url: string | undefined) => url && Linking.openURL(url).catch(() => undefined);

function Won({ client, now }: { client: OdooClient; now: () => number }) {
  const { data, error } = usePageRows(() => wonThisMonth(client, now()), [client]);
  if (error) return <PageError what="Won this month" error={error} />;
  const rows: RowItem[] | null = data?.map((r) => ({ key: `won-${r.id}`, title: r.customer || r.name, sub: `${r.name} · ${formatMoney(r.cents)}`, lines: [r.ref ?? ''].filter(Boolean) })) ?? null;
  const total = data ? data.reduce((n, r) => n + r.cents, 0) : 0;
  return <RowList rows={rows} empty="No quote has been approved this month yet." testID="won" header={data?.length ? <Note testID="won-total">{`${formatMoney(total)} from ${data.length} approved ${data.length === 1 ? 'quote' : 'quotes'}`}</Note> : undefined} />;
}

function Lost({ client }: { client: OdooClient }) {
  const { data, error } = usePageRows(() => lostQuotes(client), [client]);
  if (error) return <PageError what="Lost, and why" error={error} />;
  const rows: RowItem[] | null = data?.map((l) => ({ key: `lost-${l.orderId}`, title: l.customer || l.name, sub: l.name, lines: [`${l.reason}${l.at ? ` · ${dateText(l.at)}` : ''}`] })) ?? null;
  const by = data ? lostByReason(data) : [];
  return (
    <View style={{ gap: sp(10) }}>
      {by.length ? <Note testID="lost-summary">{by.map((b) => `${b.reason}: ${b.count}`).join(' · ')}</Note> : null}
      <Note>Only quotes marked lost from this app show a reason. Quotes cancelled in Odoo are not listed.</Note>
      <RowList rows={rows} empty="No quote has been marked lost yet." testID="lost" />
    </View>
  );
}

function Renewals({ client, limits, now }: { client: OdooClient; limits: DeptLimits; now: () => number }) {
  const { data, error } = usePageRows(async () => {
    const list = await plansAboutToRenew(client, limits, now());
    return { list, phones: await phonesFor(client, list.map((p) => p.partnerId)) };
  }, [client, limits.planRenewDays]);
  if (error) return <PageError what="Plans about to renew" error={error} />;
  const rows: RowItem[] | null = data?.list.map((p) => {
    const phone = data.phones.get(p.partnerId) ?? '';
    return { key: `plan-${p.id}`, title: p.customer, sub: p.name, lines: [`Ends ${dateText(p.endsAt)}`], actions: callLink(phone) ? [{ label: 'Call', primary: true, onPress: () => open(callLink(phone)) }] : [] };
  }) ?? null;
  return <RowList rows={rows} empty={`No plan ends in the next ${limits.planRenewDays} days.`} testID="renew" />;
}

function NotSeen({ client, limits, now }: { client: OdooClient; limits: DeptLimits; now: () => number }) {
  const { data, error } = usePageRows(async () => {
    const t = now();
    const list = (await notSeenPlaces(client, limits, t)).slice(0, 60);
    const phones = new Map<number, string>();
    if (list.length) {
      const r = (await client.call('fsm.location', 'read', [list.map((v) => v.place)], { fields: ['phone'] }).catch(() => [])) as { id: number; phone?: unknown }[];
      for (const l of r) phones.set(l.id, typeof l.phone === 'string' ? l.phone : '');
    }
    return { list, phones };
  }, [client, limits.notSeenMonths]);
  if (error) return <PageError what="Not seen in a while" error={error} />;
  const rows: RowItem[] | null = data?.list.map((v) => {
    const phone = data.phones.get(v.place) ?? '';
    const body = `Hi, it's Johnsons. It has been a while since we looked at your garage door. Want us to stop by for a tune-up? Reply here any time.`;
    return {
      key: `seen-${v.place}`,
      title: v.placeName,
      sub: `Last visit ${dateText(v.at)}`,
      lines: [v.name],
      actions: [...(callLink(phone) ? [{ label: 'Call', primary: true, onPress: () => open(callLink(phone)) }] : []), ...(textLink(phone, 'x') ? [{ label: 'Text', onPress: () => open(textLink(phone, body)) }] : [])],
    };
  }) ?? null;
  return <RowList rows={rows} empty={`Every customer had a visit in the last ${limits.notSeenMonths} months.`} testID="notseen" />;
}

/**
 * Sales and estimates: quotes that went quiet (with Mark lost), follow-up calls, what was won
 * and lost, plans about to renew, customers not seen in a while, and repairs found on
 * inspections that were never sold.
 */
export function SalesAreaScreen({ initial, now = Date.now }: { initial?: SalesTab; now?: () => number }) {
  const b = useBadges().sales;
  const limits = useLimits();
  const groups: MenuGroup<SalesTab>[] = [
    {
      title: 'Needs you now',
      items: [
        { id: 'quiet', label: LABELS.quiet, detail: `No answer after ${limits.quoteQuietDays} days`, badge: b.quiet },
        { id: 'followups', label: LABELS.followups, detail: 'Calls to make today', badge: b.followUps },
      ],
    },
    {
      title: 'Pipeline',
      items: [
        { id: 'open', label: LABELS.open, detail: 'Sent, waiting for a yes' },
        { id: 'won', label: LABELS.won, detail: 'What turned into jobs' },
        { id: 'lost', label: LABELS.lost, detail: 'Reasons you recorded' },
      ],
    },
    {
      title: 'Customers to call',
      items: [
        { id: 'renew', label: LABELS.renew, detail: `Maintenance plans ending in ${limits.planRenewDays} days`, badge: b.renewals },
        { id: 'notseen', label: LABELS.notseen, detail: `No visit in ${limits.notSeenMonths} months` },
        { id: 'flagged', label: LABELS.flagged, detail: 'Repairs found and not sold', badge: b.flagged },
      ],
    },
  ];
  return (
    <DeptArea<SalesTab>
      area="Sales"
      who="sales"
      need="sales"
      prefix="sales"
      groups={groups}
      labels={LABELS}
      initial={initial}
      page={(tab, client) => {
        switch (tab) {
          case 'quiet':
            return <MoneyList client={client} invoice={false} lost load={() => quotesQuiet(client, limits, now())} empty="No quote has gone quiet." testID="quiet" />;
          case 'open':
            return <MoneyList client={client} invoice={false} lost load={() => quotesWaiting(client, now())} empty="No quote is waiting." testID="openquotes" />;
          case 'followups':
            return <ActivityList client={client} load={() => followUpsDue(client, now())} empty="No follow-up calls are due." doneLabel="Mark done" testID="followups" />;
          case 'won':
            return <Won client={client} now={now} />;
          case 'lost':
            return <Lost client={client} />;
          case 'renew':
            return <Renewals client={client} limits={limits} now={now} />;
          case 'notseen':
            return <NotSeen client={client} limits={limits} now={now} />;
          case 'flagged':
            return <ActivityList client={client} load={() => flaggedRepairs(client)} empty="No repair is waiting to be offered." doneLabel="Mark sold or dismiss" testID="flagged" textBody={(a) => `Hi, it's Johnsons. When we inspected your door we noted: ${a.summary.replace(/^Offer repair:\s*/i, '')}. Want us to take care of it? Reply here any time.`} />;
        }
      }}
    />
  );
}
