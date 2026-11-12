import { StyleSheet, View } from 'react-native';
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
      <NavRow label="Truck stock" detail="Truck 1 in Odoo, scan, restock orders" href="/stock" testID="tools-stock" />
      <NavRow label="Wrap up the day" detail="Money to deposit, hours, miles, close the day" href="/end-of-day" testID="tools-end-of-day" />
      <NavRow label="Time and miles" detail="Clock in and out, mileage" href="/time-log" testID="tools-time" />
      <NavRow label="Schedule" detail="Book and move visits" href="/schedule" testID="tools-schedule" />

      <SectionTitle>Business</SectionTitle>
      <NavRow label="Business numbers" detail="Sales, close rate, average ticket" href="/stats" testID="tools-stats" />
      <NavRow label="Tech scorecard" detail="Owner only: quotes won, ticket, callbacks" href="/scorecard" testID="tools-scorecard" />
      <NavRow label="Team (Odoo)" detail="Jobs from Odoo, dispatch" href="/team" testID="tools-team" />
      <NavRow label="Settings" detail="Version, business details, backups" href="/settings" testID="tools-settings" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 4 },
});
