import { ErrorBoundaryProps, Stack } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OdooCustomerBackgroundSync } from '../components/OdooCustomerBackgroundSync';
import { OdooInvoicesSync } from '../components/OdooSales';
import { OdooJobSync } from '../components/OdooJobSync';
import { OdooPhotoSync } from '../components/OdooPhotoSync';
import { OdooFollowUpSync } from '../components/OdooFollowUpSync';
import { OdooSettingsSync } from '../components/OdooSettingsSync';
import { OdooPartsUsedSync } from '../components/OdooPartsUsedSync';
import { OdooRefreshSync } from '../components/OdooRefreshSync';
import { OdooVisitSync } from '../components/OdooVisitSync';
import { OdooChecklistSync } from '../components/OdooChecklistSync';
import { OdooReportSync } from '../components/OdooReportSync';
import { OdooEquipmentSync } from '../components/OdooEquipmentSync';
import { OdooAttendanceSync } from '../components/OdooAttendanceSync';
import { AttachmentsProvider } from '../lib/useAttachments';
import { CalculatorLinkProvider } from '../lib/useCalculatorLink';
import { CustomersProvider } from '../lib/useCustomers';
import { FollowUpsProvider } from '../lib/useFollowUps';
import { InvoicesProvider } from '../lib/useInvoices';
import { JobsProvider } from '../lib/useJobs';
import { OdooProvider } from '../lib/useOdoo';
import { PriceSheetProvider } from '../lib/usePriceSheet';
import { ScheduleProvider } from '../lib/useSchedule';
import { StockProvider } from '../lib/useStock';
import { WorkLogProvider } from '../lib/useWorkLog';
import { BUILD_INFO } from '../lib/appVersion';
import { installCrashHandler } from '../lib/crash';
import { describeError, log } from '../lib/log';
import { colors, touch, type } from '../theme';

// Errors nobody caught go to the log before anything else runs.
installCrashHandler(log);

/**
 * The whole app: saved data for every screen (jobs, customers, prices, invoices, schedule, time and miles, truck stock, photos and signatures, Odoo team), then a stack with the four
 * sections (as tabs) at the bottom and full pages such as a quote on top.
 * Routes live in this folder; see app/README.md, "Screens and routes".
 */
export default function RootLayout() {
  useEffect(() => {
    log.prune();
    log.info('app', `started · ${BUILD_INFO}`);
  }, []);
  return (
    <SafeAreaProvider>
      <JobsProvider>
        <CustomersProvider>
          <PriceSheetProvider>
            <InvoicesProvider>
              <FollowUpsProvider>
                <ScheduleProvider>
                  <WorkLogProvider>
                    <StockProvider>
                      <AttachmentsProvider>
                        <OdooProvider>
                          <CalculatorLinkProvider>
                            <StatusBar style="dark" />
                            <OdooCustomerBackgroundSync />
                            <OdooJobSync />
                            <OdooVisitSync />
                            <OdooRefreshSync />
                            <OdooPartsUsedSync />
                            <OdooPhotoSync />
                            <OdooFollowUpSync />
                            <OdooSettingsSync />
                            <OdooReportSync />
                            <OdooChecklistSync />
                            <OdooAttendanceSync />
                            <OdooEquipmentSync />
                            <OdooInvoicesSync />
                            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                              <Stack.Screen name="(tabs)" />
                              <Stack.Screen name="price-book" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="ticket/[id]" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="ticket-add" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="job-address/[id]" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="quote/[id]" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="backup" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="customer/[id]" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="invoices" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="invoice/[id]" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="business" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="inspection/[id]" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="stats" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="follow-ups" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="schedule" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="time-log" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="stock" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="end-of-day" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="scorecard" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="photos/[id]" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="team" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="door-weight" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="developer" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="setup" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="new-job" options={{ presentation: 'modal' }} />
                              <Stack.Screen name="job/[id]" />
                            </Stack>
                          </CalculatorLinkProvider>
                        </OdooProvider>
                      </AttachmentsProvider>
                    </StockProvider>
                  </WorkLogProvider>
                </ScheduleProvider>
              </FollowUpsProvider>
            </InvoicesProvider>
          </PriceSheetProvider>
        </CustomersProvider>
      </JobsProvider>
    </SafeAreaProvider>
  );
}

/**
 * Shown instead of a screen that hit an error while drawing, rather than a
 * blank page. The error is in the log (Settings, tap the version 7 times).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    log.error('crash', `Screen error: ${describeError(error, 12)}`);
  }, [error]);
  return (
    <View style={styles.fail} testID="error-screen">
      <Text style={styles.failTitle} accessibilityRole="header">
        Something went wrong
      </Text>
      <Text style={styles.failBody}>The app hit an error on this screen. It's saved in the log, so it can be fixed. Your saved jobs and invoices are safe.</Text>
      <Pressable onPress={retry} accessibilityRole="button" style={({ pressed }) => [styles.failButton, pressed && styles.failPressed]}>
        <Text style={styles.failButtonText}>Try again</Text>
      </Pressable>
      <Pressable onPress={() => Updates.reloadAsync().catch(() => undefined)} accessibilityRole="button" style={({ pressed }) => [styles.failButton, styles.failSecondary, pressed && styles.failPressed]}>
        <Text style={[styles.failButtonText, styles.failSecondaryText]}>Restart the app</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fail: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 16 },
  failTitle: { fontSize: type.big, fontWeight: '900', color: colors.text },
  failBody: { fontSize: type.body, fontWeight: '600', color: colors.muted, lineHeight: 26 },
  failButton: { minHeight: touch.min, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  failSecondary: { backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.border },
  failPressed: { backgroundColor: colors.safety },
  failButtonText: { fontSize: type.body, fontWeight: '800', color: colors.onSelected },
  failSecondaryText: { color: colors.text },
});
