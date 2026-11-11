import { router } from 'expo-router';
import { SectionScroll } from '../../components/SectionScroll';
import { useCalculatorLink } from '../../lib/useCalculatorLink';
import { JobsScreen } from '../../screens/JobsScreen';

export default function JobsRoute() {
  const { requestOpen } = useCalculatorLink();
  return (
    <SectionScroll>
      <JobsScreen
        onOpen={(job) => {
          requestOpen(job);
          router.navigate('/');
        }}
      />
    </SectionScroll>
  );
}
