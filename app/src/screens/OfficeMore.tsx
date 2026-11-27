import { StyleSheet, Text as RNText, View } from 'react-native';
import { Caption, IconRow, RowGroup } from '../components/ToolRows';
import { SHORT_VERSION } from '../lib/appVersion';
import { officeTotal } from '../lib/deptBadges';
import { useBadges } from '../lib/useBadges';
import { colors, fs, sp } from '../theme';

/**
 * The office-only More tab: the office areas, the price book, follow-up calls and Time and miles.
 * No spring or door tools, no truck, and no "Wrap up the day": those are for the field.
 */
export function OfficeMore() {
  const badges = useBadges();
  const n = officeTotal(badges);
  return (
    <View style={styles.stack} testID="office-more">
      <Caption>Office</Caption>
      <RowGroup>
        <IconRow icon="tag" label="Office" detail="Money, people, customers, warranty" href="/office" testID="more-office" badge={n > 0 ? `${n} to look at` : undefined} warn={n > 0} last />
      </RowGroup>
      <Caption>Customers and prices</Caption>
      <RowGroup>
        <IconRow icon="bell" label="Follow-ups" detail="Warranty and tune-up calls" href="/follow-ups" testID="more-followups" />
        <IconRow icon="tag" label="Price book" detail="Parts and labor prices" href="/price-book" testID="more-price-book" last />
      </RowGroup>
      <Caption>You</Caption>
      <RowGroup>
        <IconRow icon="clock" label="Time and miles" detail="Clock in, clock out" href="/time-log" testID="more-timelog" last />
      </RowGroup>
      <RNText style={styles.version}>Version {SHORT_VERSION} · tap the gear for Settings</RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: sp(8) },
  version: { textAlign: 'center', fontSize: fs(14), fontWeight: '600', color: colors.muted, paddingTop: sp(4) },
});
