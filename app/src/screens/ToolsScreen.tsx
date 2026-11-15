import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { followUps } from '../lib/followups';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { StatsCard } from './StatsScreen';
import { StockButton } from './StockScreen';
import { ClockButton } from './WorkLogScreen';
import { NavRow } from '../components/Buttons';
import { SectionTitle } from '../components/controls';

/** Everything that isn't a job, a sale or a customer: calculators, manuals, the truck, the day. */
export function ToolsScreen() {
  return (
    <View style={styles.stack} testID="tools">
      <SectionTitle first>In the field</SectionTitle>
      <NavRow label="Spring calculator" detail="Match old, size from door, extension, high lift" href="/springs" testID="tools-springs" />
      <NavRow label="Door weight" detail="Estimate it from size and type" href="/door-weight" testID="tools-door-weight" />
      <NavRow label="Diagnose" detail="Opener codes, symptoms and programming" href="/diagnose" testID="tools-diagnose" />
      <NavRow label="Manuals" detail="Makers' install and owner's manuals" href="/manuals" testID="tools-manuals" />

      <SectionTitle>Truck and day</SectionTitle>
      <View><StockButton /></View>
      <NavRow label="Wrap up the day" detail="Money to deposit, hours, miles, close the day" href="/end-of-day" testID="tools-end-of-day" />
      <View><ClockButton /></View>
      <FollowUpsRow />
      <NavRow label="Schedule" detail="Book and move visits" href="/schedule" testID="tools-schedule" />

      <SectionTitle>Business</SectionTitle>
      <StatsCard />
      <NavRow label="Price book" detail="Parts and labor prices" href="/price-book" testID="tools-price-book" />
      <NavRow label="Business numbers" detail="Sales, close rate, average ticket" href="/stats" testID="tools-stats" />
      <NavRow label="Tech scorecard" detail="Owner only: quotes won, ticket, callbacks" href="/scorecard" testID="tools-scorecard" />
      <NavRow label="Team (Odoo)" detail="Jobs from Odoo, dispatch" href="/team" testID="tools-team" />
      <NavRow label="Settings" detail="Version, business details, backups" href="/settings" testID="tools-settings" />
    </View>
  );
}

/** Follow-ups, with how many fall due in the next week. */
function FollowUpsRow() {
  const { invoices, business } = useInvoices();
  const { settings, dismissed } = useFollowUps();
  const due = useMemo(() => followUps(invoices, settings, business, Date.now(), dismissed).filter((f) => f.due <= Date.now() + 7 * 24 * 3600 * 1000).length, [invoices, settings, business, dismissed]);
  return <NavRow label="Follow-ups" detail={due > 0 ? `${due} due` : 'Warranty and tune-up calls'} href="/follow-ups" testID="tools-followups" />;
}

const styles = StyleSheet.create({
  stack: { gap: 4 },
});
