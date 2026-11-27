import { StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { Caption, IconRow, RowGroup } from '../components/ToolRows';
import { SHORT_VERSION } from '../lib/appVersion';
import { salesTotal } from '../lib/deptBadges';
import { useBadges } from '../lib/useBadges';
import { colors, fs, sp } from '../theme';
import { FollowUpsRow } from './ToolsScreen';

/**
 * The sales-only More tab: the Sales area, follow-up calls, requesting parts, the price book and
 * the schedule. No field tools (springs, door weight, diagnose, manuals), no truck stock, and
 * no Wrap up the day.
 */
export function SalesMore() {
  const badges = useBadges();
  const total = salesTotal(badges);
  return (
    <View style={styles.stack} testID="sales-more">
      <Caption>Selling</Caption>
      <RowGroup>
        <IconRow icon="star" label="Sales" detail="Quiet quotes, follow-ups, renewals, repairs not sold" href="/sales-area" testID="more-sales-area" badge={total > 0 ? `${total} to look at` : undefined} warn={total > 0} />
        <FollowUpsRow />
        <IconRow icon="truck" label="Request parts" detail="Ask the buyer for a part" href="/request-parts" testID="more-request-parts" last />
      </RowGroup>
      <Caption>Prices and visits</Caption>
      <RowGroup>
        <IconRow icon="tag" label="Price book" detail="Parts and labor prices" href="/price-book" testID="more-price-book" />
        <IconRow icon="cal" label="Schedule" detail="Book and move visits" href="/schedule" testID="more-schedule" last />
      </RowGroup>
      <Text style={styles.version}>Version {SHORT_VERSION} · tap the gear for Settings</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(12) },
  version: { textAlign: 'center', fontSize: fs(14), fontWeight: '600', color: colors.muted, paddingTop: sp(4) },
});
