import { ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import { isRealOwner } from '../lib/scorecard';
import { useOwner } from '../lib/useDepartments';
import { useOdoo } from '../lib/useOdoo';
import { colors, radius, type, bw, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

/**
 * Shows its page only to the owner (an Odoo admin or Field Service manager).
 * A tech who gets here by any route sees a short note instead. Signed out, the
 * phone's one user sees everything. `realOwner` is for the Developer screen:
 * it ignores "Look as a tech", so the owner can always turn the preview off.
 */
export function OwnerOnly({ children, what, realOwner }: { children: ReactNode; what: string; realOwner?: boolean }) {
  const styles = useStyles();
  const { status, client } = useOdoo();
  const gate = useOwner();
  const [real, setReal] = useState<boolean | null>(null);
  useEffect(() => {
    if (!realOwner || !client) return;
    let alive = true;
    isRealOwner(client).then((o) => alive && setReal(o), () => alive && setReal(false));
    return () => {
      alive = false;
    };
  }, [realOwner, client]);

  const signedOut = status === 'signedOut' && !client;
  const ready = realOwner && client ? real !== null : gate.ready;
  const allowed = signedOut || (realOwner && client ? real === true : gate.owner);
  if (!ready) return <Text style={styles.sub}>Checking your Odoo access…</Text>;
  if (!allowed) {
    return (
      <View style={styles.card} testID="owner-only">
        <Text style={styles.name}>For the owner</Text>
        <Text style={styles.body}>{what} is for the owner. Ask the owner if you need something changed.</Text>
      </View>
    );
  }
  return <>{children}</>;
}

const useStyles = makeStyles(() => ({
  sub: { fontSize: type.body, fontWeight: '600', color: colors.muted },
  card: { borderWidth: bw(1.5), borderColor: colors.border, borderRadius: radius.card ?? 12, padding: sp(14), backgroundColor: colors.card, gap: sp(6) },
  name: { fontSize: type.body, fontWeight: '800', color: colors.text },
  body: { fontSize: type.body, fontWeight: '600', color: colors.text },
}));
