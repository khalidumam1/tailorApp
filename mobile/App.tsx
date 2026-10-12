/**
 * TailorApp mobile shell.
 *
 * This file is the entry point. It composes the theme provider, the
 * workspace provider, and the per-screen rendering. Every screen reads
 * its data from `useWorkspace()` so the screens stay small and focused
 * on UI concerns.
 *
 * Tab bar: a Payrio-style floating 5-tab glass bar (Home · Orders ·
 * Payments · Activity · More). Other workspaces (Measurements, WhatsApp,
 * Subscription, Settings, Business settings) are reachable from the
 * More hub.
 */
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  MobileBrandingProvider,
  useAppTheme,
} from './src/theme/palette';
import { useAppStyles } from './src/theme/useAppStyles';
import { WorkspaceProvider, useWorkspace, type Page } from './src/hooks/useWorkspace';

import { Header } from './src/components/Header';
import { TabBar, type TabDescriptor, type TabKey } from './src/components/TabBar';

import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BusinessSettingsScreen } from './src/screens/BusinessSettingsScreen';
import { SubscriptionScreen } from './src/screens/SubscriptionScreen';
import { ActionButton } from './src/theme/primitives';

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileBrandingProvider>
        <WorkspaceProvider>
          <AppShell />
        </WorkspaceProvider>
      </MobileBrandingProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const ws = useWorkspace();
  const styles = useAppStyles();
  const { themeMode, palette } = useAppTheme();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [page, setPage] = useState<Page>('home');

  if (ws.booting) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator color={palette.primary} size="large" />
        <Text style={styles.pageSubtitle}>{ws.copy.loading}</Text>
      </SafeAreaView>
    );
  }

  if (!ws.localReady) {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <Text style={styles.heading}>{ws.copy.startupFailed}</Text>
        <Text accessibilityRole="alert" style={styles.errorText}>
          {ws.bootError || ws.copy.error}
        </Text>
        <ActionButton title={ws.copy.retry} onPress={ws.retryBoot} />
      </SafeAreaView>
    );
  }

  if (!ws.session) {
    return <LoginScreen />;
  }

  const tabs: TabDescriptor[] = [
    { key: 'home', label: ws.copy.home, icon: 'home' },
    { key: 'orders', label: ws.term('orders', ws.copy.orders), icon: 'orders' },
    { key: 'payments', label: ws.copy.paymentsTab, icon: 'wallet' },
    { key: 'activity', label: ws.copy.activityTab, icon: 'chart' },
    { key: 'more', label: ws.copy.moreTab, icon: 'menu' },
  ];

  // Decide which screen to render based on the active tab and any explicit
  // page navigation (e.g. tapping an item inside More).
  let content: React.ReactNode = null;
  if (page === 'home' || activeTab === 'home') content = <DashboardScreen />;
  else if (page === 'orders' || activeTab === 'orders') content = <OrdersScreen />;
  else if (page === 'customers') content = <CustomersScreen />;
  else if (page === 'payments' || activeTab === 'payments') content = <PaymentsScreen />;
  else if (page === 'activity' || activeTab === 'activity') content = <ActivityScreen />;
  else if (page === 'more' || activeTab === 'more') {
    content = <MoreScreen onNavigate={(p) => { setPage(p); setActiveTab('more'); }} />;
  }
  else if (page === 'settings') content = <SettingsScreen />;
  else if (page === 'business-settings') content = <BusinessSettingsScreen />;
  else if (page === 'subscription') content = <SubscriptionScreen />;

  return (
    <SafeAreaView style={[styles.safe, ws.rtl && styles.rtlLayout]} edges={['top']}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <Header onNotificationsPress={() => { setPage('notifications'); setActiveTab('activity'); }} />
      <View style={styles.workspace}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {ws.error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{ws.error}</Text> : null}
          {content}
        </ScrollView>
        <TabBar
          tabs={tabs}
          active={activeTab}
          onChange={(next) => {
            setActiveTab(next);
            // Reset the explicit page so the tab dictates the content.
            if (next === 'home') setPage('home');
            else if (next === 'orders') setPage('orders');
            else if (next === 'payments') setPage('payments');
            else if (next === 'activity') setPage('activity');
            else if (next === 'more') setPage('more');
            ws.setError('');
          }}
        />
      </View>
    </SafeAreaView>
  );
}
