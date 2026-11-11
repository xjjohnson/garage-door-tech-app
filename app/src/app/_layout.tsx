import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CalculatorLinkProvider } from '../lib/useCalculatorLink';
import { CustomersProvider } from '../lib/useCustomers';
import { InvoicesProvider } from '../lib/useInvoices';
import { JobsProvider } from '../lib/useJobs';
import { PriceSheetProvider } from '../lib/usePriceSheet';
import { colors } from '../theme';

/**
 * The whole app: saved data for every screen (jobs, customers, prices, invoices), then a stack with the four
 * sections (as tabs) at the bottom and full pages such as a quote on top.
 * Routes live in this folder; see app/README.md, "Screens and routes".
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <JobsProvider>
        <CustomersProvider>
          <PriceSheetProvider>
            <InvoicesProvider>
              <CalculatorLinkProvider>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="price-sheet" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="quote/[id]" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="backup" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="customers" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="customer/[id]" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="invoices" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="invoice/[id]" options={{ presentation: 'modal' }} />
                  <Stack.Screen name="business" options={{ presentation: 'modal' }} />
                </Stack>
              </CalculatorLinkProvider>
            </InvoicesProvider>
          </PriceSheetProvider>
        </CustomersProvider>
      </JobsProvider>
    </SafeAreaProvider>
  );
}
