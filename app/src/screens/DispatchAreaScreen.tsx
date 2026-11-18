import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Note, Title } from '../components/Dept';
import { MenuGroup, SectionMenu, SectionPage } from '../components/SectionMenu';
import { useBadges } from '../lib/useBadges';
import { useDepartments } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { DispatchScreen } from './DispatchScreen';

type Tab = 'unassigned' | 'notime' | 'late' | 'double' | 'board';
const LABELS: Record<Tab, string> = { unassigned: 'Not assigned', notime: 'No time set', late: 'Running late', double: 'Double booked', board: "Today's board" };

/**
 * The dispatcher's area, as a grouped list like Warehouse and Purchasing.
 * Every page is Odoo's own Field Service orders and workers; nothing here is
 * kept on the phone. More pages (late, double booked, week, upcoming visits,
 * who is working) are added to the same list as they are built.
 */
export function DispatchAreaScreen() {
  const { client, status } = useOdoo();
  const { access, ready } = useDepartments();
  const badges = useBadges();
  const [tab, setTab] = useState<Tab | null>(null);
  const back = useCallback(() => setTab(null), []);

  if (status === 'loading' || status === 'signingIn' || (client && !ready)) return <Note>Checking your Odoo access…</Note>;
  if (!client) return <Note testID="dispatch-signin">Sign in to Odoo to use Dispatch. Jobs and workers are kept in Odoo Field Service.</Note>;
  if (!access.dispatch) {
    return (
      <Card testID="dispatch-no-access">
        <Title>For the dispatcher</Title>
        <Note>This area opens for people in Odoo's Field Service Dispatcher group, or the owner. Ask the owner to add you in Odoo (Settings, Users).</Note>
      </Card>
    );
  }
  const groups: MenuGroup<Tab>[] = [
    {
      title: 'Needs you now',
      items: [
        { id: 'unassigned', label: 'Not assigned', detail: 'Jobs with no tech yet', badge: badges.dispatch.unassigned },
        { id: 'notime', label: 'No time set', detail: 'A tech, but no start time', badge: badges.dispatch.noTime },
        { id: 'late', label: 'Running late', detail: 'Start time passed, tech not arrived', badge: badges.dispatch.late },
        { id: 'double', label: 'Double booked', detail: 'Two jobs at once for one tech', badge: badges.dispatch.double },
      ],
    },
    {
      title: 'The day',
      items: [{ id: 'board', label: "Today's board", detail: 'A lane per tech, with their jobs' }],
    },
  ];
  return (
    <View style={styles.stack} testID="dispatch-area">
      {tab === null ? <SectionMenu groups={groups} onPick={setTab} testID="dispatch-tabs" rowTestID={(id) => `dispatch-tab-${id}`} /> : null}
      {tab !== null ? (
        <SectionPage area="Dispatch" title={LABELS[tab]} onBack={back} testID="dispatch-back">
          <DispatchScreen part={tab} />
        </SectionPage>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: 12 } });
