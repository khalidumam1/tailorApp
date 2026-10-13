/**
 * TailorApp mobile shell.
 *
 * Composes the theme provider, the workspace provider, and the navigation.
 * Five root tabs (Home · Orders · Payments · Activity · More) sit in the
 * floating tab bar. Every other page is pushed onto a back stack and opened
 * with a back control (or the Android back button).
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  MobileBrandingProvider,
  useAppTheme,
} from './src/theme/palette';
import { useAppStyles } from './src/theme/useAppStyles';
import { WorkspaceProvider, useWorkspace } from './src/hooks/useWorkspace';
import type { NavIntent, NavPage, Navigate, TabKey } from './src/navigation';

import { Header } from './src/components/Header';
import { TabBar, type TabDescriptor } from './src/components/TabBar';
import { Icon } from './src/Icons';

import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { OrdersScreen } from './src/screens/OrdersScreen';
import { CustomersScreen } from './src/screens/CustomersScreen';
import { CatalogScreen } from './src/screens/CatalogScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { MeasurementsScreen } from './src/screens/MeasurementsScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { SubscriptionScreen } from './src/screens/SubscriptionScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { BusinessSettingsScreen } from './src/screens/BusinessSettingsScreen';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { ActionButton } from './src/theme/primitives';

const TAB_PAGES: TabKey[] = ['home', 'orders', 'payments', 'activity', 'more'];

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
  // stack[0] is always a root tab; deeper entries are pushed pages.
  const [stack, setStack] = useState<NavPage[]>(['home']);
  const [intent, setIntent] = useState<NavIntent | null>(null);

  const navigate = useCallback<Navigate>((target, nextIntent) => {
    setIntent(nextIntent ?? null);
    setStack((current) => {
      if ((TAB_PAGES as NavPage[]).includes(target)) return [target];
      if (current[current.length - 1] === target) return current;
      return [...current, target];
    });
  }, []);

  const goBack = useCallback(() => {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const clearIntent = useCallback(() => setIntent(null), []);

  // Android back button: pop a pushed page before leaving the app.
  const canGoBack = stack.length > 1;
  useEffect(() => {
    if (!canGoBack) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, goBack]);

  // Clear per-page errors whenever the page changes.
  const page = stack[stack.length - 1];
  useEffect(() => { ws.setError(''); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

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

  let content: React.ReactNode = null;
  switch (page) {
    case 'home':
      content = <DashboardScreen onNavigate={navigate} />;
      break;
    case 'orders':
      content = <OrdersScreen intent={intent} onIntentHandled={clearIntent} onOpenCustomers={() => navigate('customers')} />;
      break;
    case 'payments':
      content = <PaymentsScreen intent={intent} onIntentHandled={clearIntent} />;
      break;
    case 'activity':
      content = <ActivityScreen />;
      break;
    case 'more':
      content = <MoreScreen onNavigate={navigate} />;
      break;
    case 'customers':
      content = <CustomersScreen />;
      break;
    case 'catalog':
      content = <CatalogScreen />;
      break;
    case 'measurements':
      content = <MeasurementsScreen />;
      break;
    case 'notifications':
      content = <NotificationsScreen />;
      break;
    case 'subscription':
      content = <SubscriptionScreen />;
      break;
    case 'settings':
      content = <SettingsScreen />;
      break;
    case 'business-settings':
      content = <BusinessSettingsScreen />;
      break;
    case 'analytics':
      content = <AnalyticsScreen />;
      break;
    default:
      content = null;
  }

  return (
    <SafeAreaView style={[styles.safe, ws.rtl && styles.rtlLayout]} edges={['top']}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <Header
        onNotificationsPress={() => navigate('notifications')}
        onSearchPress={() => navigate('customers')}
      />
      <View style={styles.workspace}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {stack.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ws.copy.back}
              android_ripple={{ color: palette.primarySoft, borderless: true }}
              onPress={goBack}
              style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
            >
              <Icon name="arrowLeft" size={18} color={palette.primaryText} />
              <Text style={styles.backText}>{ws.copy.back}</Text>
            </Pressable>
          ) : null}
          {ws.error ? <Text accessibilityRole="alert" style={styles.errorBanner}>{ws.error}</Text> : null}
          {content}
        </ScrollView>
        <TabBar
          tabs={tabs}
          active={stack[0] as TabKey}
          onChange={(next) => navigate(next)}
        />
      </View>
    </SafeAreaView>
  );
}
