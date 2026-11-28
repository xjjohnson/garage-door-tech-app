import { ReactNode, useCallback, useState } from 'react';
import { View } from 'react-native';
import { refreshBadges } from '../lib/deptBadges';
import { useDepartments } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import type { Access } from '../lib/odooWarehouse';
import type { OdooClient } from '../lib/odoo';
import { Card, Note, Title } from './Dept';
import { MenuGroup, SectionMenu, SectionPage } from './SectionMenu';
import { sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/**
 * The shell Office, Sales and Owner overview share: sign-in and access checks, the grouped list,
 * and one opened page with a back row. Pages draw themselves; nothing is kept on the phone.
 */
export function DeptArea<T extends string>({ area, who, need, groups, labels, page, initial, prefix, front }: { area: string; who: string; need: keyof Access; groups: MenuGroup<T>[]; labels: Record<T, string>; page: (tab: T, client: OdooClient) => ReactNode; initial?: T; prefix: string; /** Draws the front page itself, in place of the grouped list. */ front?: (open: (id: T) => void, client: OdooClient) => ReactNode }) {
  const styles = useStyles();
  const { client, status } = useOdoo();
  const { access, ready } = useDepartments();
  const [tab, setTab] = useState<T | null>(initial ?? null);
  // Leaving a page asks for fresh counts, so what was just done (an invoice sent, a quote chased) comes off the red number.
  const back = useCallback(() => {
    setTab(null);
    refreshBadges();
  }, []);
  if (status === 'loading' || status === 'signingIn' || (client && !ready)) return <Note>Checking your Odoo access…</Note>;
  if (!client) return <Note testID={`${prefix}-signin`}>Sign in to Odoo to use {area}. Everything here is read from Odoo.</Note>;
  if (!access[need]) {
    return (
      <Card testID={`${prefix}-no-access`}>
        <Title>For {who}</Title>
        <Note>This area opens for the owner and for people given the {area} role. Ask the owner to add you under Management, Team roles.</Note>
      </Card>
    );
  }
  return (
    <View style={styles.stack} testID={`${prefix}-area`}>
      {tab === null && front ? front(setTab, client) : null}
      {tab === null && !front ? <SectionMenu groups={groups} onPick={setTab} testID={`${prefix}-tabs`} rowTestID={(id) => `${prefix}-tab-${id}`} /> : null}
      {tab !== null ? (
        <SectionPage area={area} title={labels[tab]} onBack={back} testID={`${prefix}-back`}>
          {page(tab, client)}
        </SectionPage>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({ stack: { gap: sp(12) } }));
