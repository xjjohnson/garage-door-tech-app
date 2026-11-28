import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../components/AppText';
import { Action } from '../components/Buttons';
import { AlertBanner, Caption, IconRow, RowGroup, ToolTile } from '../components/ToolRows';
import { SHORT_VERSION } from '../lib/appVersion';
import { followUps } from '../lib/followups';
import { isLow } from '../lib/stock';
import { useFollowUps } from '../lib/useFollowUps';
import { useInvoices } from '../lib/useInvoices';
import { useDepartments, useOwner } from '../lib/useDepartments';
import { useStock } from '../lib/useStock';
import { useBadges } from '../lib/useBadges';
import { dispatchTotal, officeTotal, overviewTotal, purchasingTotal, salesTotal } from '../lib/deptBadges';
import { useWorkLog } from '../lib/useWorkLog';
import { formatHours, openShift, shiftMs } from '../lib/worklog';
import { colors, fs, layouts, sp } from '../theme';
import { StatsCard } from './StatsScreen';
import { makeStyles } from '../lib/makeStyles';
import { useGarageTools, useIndustryPicked } from '../lib/industry';
import { currentFlavor } from '../flavor';

/**
 * Everything that isn't a job, a sale or a customer. The week's numbers on
 * top, then what needs a look (low truck stock), the end-of-day button, the
 * four field tools as tiles, and the rest as grouped rows. Settings is the
 * gear in the header, so it is not a row here.
 */
export function ToolsScreen() {
  const styles = useStyles();
  const { items } = useStock();
  const low = items.filter(isLow).length;
  const { access } = useDepartments();
  const { owner } = useOwner();
  const badges = useBadges();
  const buying = purchasingTotal(badges);
  const mode = layouts.tools;
  const garage = useGarageTools();
  const picked = useIndustryPicked();
  const businessGroup = (
    <>
      <Caption>Business</Caption>
      <RowGroup>
        <IconRow icon="tag" label="Price book" detail="Parts and labor prices" href="/price-book" testID="tools-price-book" last={!owner} />
        {owner ? <IconRow icon="chart" label="Business numbers" detail="Sales, close rate, average ticket" tag="Owner only" href="/stats" testID="tools-stats" /> : null}
        {owner ? <IconRow icon="star" label="Tech scorecard" detail="Quotes won, ticket, callbacks" tag="Owner only" href="/scorecard" testID="tools-scorecard" last /> : null}
      </RowGroup>
    </>
  );
  const departments = access.warehouse || access.purchasing || access.dispatch || access.office || access.sales || access.owner ? (
        <>
          <Caption>Departments</Caption>
          <RowGroup>
            {access.owner ? <IconRow icon="chart" label="Owner overview" detail="Everything that needs you, in one list" href="/overview" testID="tools-overview" badge={overviewTotal(badges) > 0 ? `${overviewTotal(badges)} to look at` : undefined} warn={overviewTotal(badges) > 0} /> : null}
            {access.office ? <IconRow icon="tag" label="Office" detail="Invoices, payments, quotes, customers, warranty" href="/office" testID="tools-office" badge={officeTotal(badges) > 0 ? `${officeTotal(badges)} to look at` : undefined} warn={officeTotal(badges) > 0} /> : null}
            {access.sales ? <IconRow icon="star" label="Sales" detail="Quotes, follow-ups, renewals, repairs not sold" href="/sales-area" testID="tools-sales" badge={salesTotal(badges) > 0 ? `${salesTotal(badges)} to look at` : undefined} warn={salesTotal(badges) > 0} /> : null}
            {access.dispatch ? <IconRow icon="cal" label="Dispatch" detail="Give out jobs, see each tech's day" href="/dispatch" testID="tools-dispatch" badge={dispatchTotal(badges) > 0 ? `${dispatchTotal(badges)} to look at` : undefined} warn={dispatchTotal(badges) > 0} last={!access.warehouse && !access.purchasing} /> : null}
            {access.warehouse ? <IconRow icon="truck" label="Warehouse" detail="Stock, order, receive, count, move parts" href="/warehouse" testID="tools-warehouse" badge={badges.warehouse.receive + badges.warehouse.handOver > 0 ? `${badges.warehouse.receive + badges.warehouse.handOver} to do` : undefined} warn={badges.warehouse.receive + badges.warehouse.handOver > 0} last={!access.purchasing} /> : null}
            {access.purchasing ? <IconRow icon="tag" label="Purchasing" detail="What to order, purchase orders, cost and prices" href="/purchasing" testID="tools-purchasing" badge={buying > 0 ? `${buying} to do` : undefined} warn={buying > 0} last /> : null}
          </RowGroup>
        </>
      ) : null;
  return (
    <View style={styles.stack} testID="tools">
      {mode === 'shop' ? departments : null}
      {owner ? <StatsCard /> : null}
      {badges.ready > 0 ? <AlertBanner testID="parts-ready-alert" title={`${badges.ready} job order${badges.ready === 1 ? '' : 's'} ready at the warehouse`} detail="Pick them up, then tap Got it on the job" action="Jobs" onPress={() => router.push('/jobs')} /> : null}
      {low > 0 ? <AlertBanner testID="stock-alert" title={`Truck stock: ${low} low`} detail="Check what to reorder" action="Review" onPress={() => router.push('/stock')} /> : null}
      {owner && !picked && currentFlavor().id === 'fscrew' ? <AlertBanner testID="industry-nudge" title="Pick your industry" detail="It decides which tools your crew sees. Management > Industry" action="Choose" onPress={() => router.push('/manage')} /> : null}
      <Action primary label="Wrap up the day" hint="Money to deposit, hours, miles, close the day" onPress={() => router.push('/end-of-day')} testID="tools-end-of-day" />

      {mode === 'calc' ? (
        <View style={styles.pair}>
          {garage ? <Action primary label="Spring calc" onPress={() => router.push('/springs')} testID="tools-springs-big" grow /> : null}
          <Action primary label="Parts and truck" onPress={() => router.push('/stock')} testID="tools-stock-big" grow />
        </View>
      ) : null}

      {mode === 'business' ? businessGroup : null}

      {(mode === 'compact' || mode === 'business' || mode === 'calc' || mode === 'shop') && garage ? (
        <>
          <Caption>{mode === 'calc' ? 'All tools' : 'In the field'}</Caption>
          <RowGroup>
            <IconRow icon="calc" label="Spring calculator" detail="Match old, size, extension" href="/springs" testID="tools-springs" />
            <IconRow icon="weight" label="Door weight" detail="Estimate from size and type" href="/door-weight" testID="tools-door-weight" />
            <IconRow icon="diag" label="Diagnose" detail="Opener codes and symptoms" href="/diagnose" testID="tools-diagnose" />
            <IconRow icon="book" label="Manuals" detail="Install and owner's manuals" href="/manuals" testID="tools-manuals" last={mode === 'calc' ? false : true} />
          </RowGroup>
        </>
      ) : mode === 'compact' || mode === 'business' || mode === 'calc' || mode === 'shop' || (!garage && mode !== 'tiles') ? null : (
        <>
          <Caption>In the field</Caption>
          <View style={styles.tiles}>
            {garage ? <ToolTile icon="calc" label="Spring calculator" detail="Match old, size, extension" href="/springs" testID="tools-springs" /> : null}
            {garage ? <ToolTile icon="weight" label="Door weight" detail="Estimate from size and type" href="/door-weight" testID="tools-door-weight" /> : null}
            {garage ? <ToolTile icon="diag" label="Diagnose" detail="Opener codes and symptoms" href="/diagnose" testID="tools-diagnose" /> : null}
            {garage ? <ToolTile icon="book" label="Manuals" detail="Install and owner's manuals" href="/manuals" testID="tools-manuals" /> : null}
            {mode === 'tiles' ? <ToolTile icon="truck" label="Truck stock" detail={low > 0 ? `${low} low` : 'Parts on the truck'} href="/stock" testID="open-stock-tile" /> : null}
            {mode === 'tiles' ? <ToolTile icon="clock" label="Time and miles" detail="Clock in, clock out, trip log" href="/time-log" testID="open-time-log-tile" /> : null}
          </View>
        </>
      )}

      <Caption>Truck and day</Caption>
      <RowGroup>
        {mode === 'tiles' ? null : <IconRow icon="truck" label="Truck stock" detail="Parts on the truck" href="/stock" testID="open-stock" badge={low > 0 ? `${low} low` : undefined} warn={low > 0} />}
        {mode === 'tiles' ? null : <TimeRow />}
        <FollowUpsRow />
        <IconRow icon="cal" label="Schedule" detail="Book and move visits" href="/schedule" testID="tools-schedule" last />
      </RowGroup>

      {mode === 'business' ? null : businessGroup}

      {mode === 'shop' ? null : departments}

      <Text style={styles.version}>Version {SHORT_VERSION} · tap the gear for Settings</Text>
    </View>
  );
}

/** Time and miles, with the running day when on the clock. */
function TimeRow() {
  const { shifts } = useWorkLog();
  const open = openShift(shifts);
  return (
    <IconRow
      icon="clock"
      label="Time and miles"
      detail={open ? `On the clock ${formatHours(shiftMs(open, Date.now()))}` : 'Clock in, clock out, trip log'}
      href="/time-log"
      testID="open-time-log"
      badge={open ? 'On' : undefined}
    />
  );
}

/** Follow-ups, with how many fall due in the next week. */
function FollowUpsRow() {
  const { invoices, business } = useInvoices();
  const { settings, dismissed } = useFollowUps();
  const due = useMemo(() => followUps(invoices, settings, business, Date.now(), dismissed).filter((f) => f.due <= Date.now() + 7 * 24 * 3600 * 1000).length, [invoices, settings, business, dismissed]);
  return <IconRow icon="bell" label="Follow-ups" detail={due > 0 ? `${due} due` : 'Warranty and tune-up calls'} href="/follow-ups" testID="tools-followups" badge={due > 0 ? `${due} due` : undefined} warn={due > 0} />;
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(12) },
  pair: { flexDirection: 'row', gap: sp(10) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: sp(10) },
  version: { textAlign: 'center', fontSize: fs(14), fontWeight: '600', color: colors.muted, paddingTop: sp(4) },
}));
