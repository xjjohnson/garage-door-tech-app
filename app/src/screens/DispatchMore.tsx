import { Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import { useState } from 'react';
import { Note } from '../components/Dept';
import { IconRow, RowGroup, Caption } from '../components/ToolRows';
import { SectionPage } from '../components/SectionMenu';
import { useOdoo } from '../lib/useOdoo';
import { DispatchScreen } from './DispatchScreen';
import { FollowUpsDue, TimeOff, TruckAlerts, WhoIsWorking } from './DispatchTeamPages';
import { colors, fs, sp } from '../theme';
import { makeStyles } from '../lib/makeStyles';

type Page = 'waiting' | 'followups' | 'working' | 'timeoff' | 'trucks';
const TITLE: Record<Page, string> = { waiting: 'Waiting to be booked', followups: 'Follow-ups due', working: "Who's working", timeoff: 'Time off', trucks: 'Truck parts alerts' };

/** The dispatcher-only More tab: the rest of Dispatch (coming up, your team) and Time and miles. No field tools. */
export function DispatchMore() {
  const styles = useStyles();
  const { client } = useOdoo();
  const [page, setPage] = useState<Page | null>(null);
  if (!client) return <Note testID="dispatch-more-signin">Sign in to Odoo to use Dispatch.</Note>;
  if (page) {
    return (
      <SectionPage area="More" title={TITLE[page]} onBack={() => setPage(null)} testID="dispatch-more-page">
        <Pressable onPress={() => setPage(null)} accessibilityRole="button" accessibilityLabel="Back to More" testID="dispatch-more-back" style={styles.back}>
          <Text style={styles.backText}>‹ More</Text>
        </Pressable>
        {page === 'waiting' ? <DispatchScreen part="waiting" /> : null}
        {page === 'followups' ? <FollowUpsDue client={client} /> : null}
        {page === 'working' ? <WhoIsWorking client={client} /> : null}
        {page === 'timeoff' ? <TimeOff client={client} /> : null}
        {page === 'trucks' ? <TruckAlerts client={client} /> : null}
      </SectionPage>
    );
  }
  return (
    <View style={styles.stack} testID="dispatch-more">
      <Caption>Coming up</Caption>
      <RowGroup>
        <IconRow icon="cal" label="Waiting to be booked" detail="Open jobs with no date" onPress={() => setPage('waiting')} testID="more-waiting" />
        <IconRow icon="bell" label="Follow-ups due" detail="Calls to make today" onPress={() => setPage('followups')} testID="more-followups" last />
      </RowGroup>
      <Caption>Your team</Caption>
      <RowGroup>
        <IconRow icon="users" label="Who's working" detail="Clocked in, and where the truck was last seen" onPress={() => setPage('working')} testID="more-working" />
        <IconRow icon="sun" label="Time off" detail="Who is out in the next two weeks" onPress={() => setPage('timeoff')} testID="more-timeoff" />
        <IconRow icon="truck" label="Truck parts alerts" detail="Trucks low on a part" onPress={() => setPage('trucks')} testID="more-trucks" last />
      </RowGroup>
      <Caption>You</Caption>
      <RowGroup>
        <IconRow icon="clock" label="Time and miles" detail="Clock in, clock out, trip log" href="/time-log" testID="more-timelog" last />
      </RowGroup>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: sp(8) },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: sp(4) },
  backText: { fontSize: fs(18), fontWeight: '800', color: colors.selected },
}));
