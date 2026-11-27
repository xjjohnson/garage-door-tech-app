import { SectionScroll } from '../../components/SectionScroll';
import { DispatchScreen } from '../../screens/DispatchScreen';

/** Week: every tech's jobs for the next 7 days (the dispatcher bar's Week tab). */
export default function WeekRoute() {
  return (
    <SectionScroll>
      <DispatchScreen part="week" />
    </SectionScroll>
  );
}
