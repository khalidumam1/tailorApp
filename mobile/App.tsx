import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Network from 'expo-network';
import * as SQLite from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

type LocalState = 'loading' | 'ready' | 'error';

export default function App() {
  const [localState, setLocalState] = useState<LocalState>('loading');
  const [online, setOnline] = useState<boolean | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const databaseSetup = SQLite.openDatabaseAsync('tailorapp.db').then((database) =>
      database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS local_customers (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS local_measurements (
          id TEXT PRIMARY KEY NOT NULL,
          customer_id TEXT NOT NULL,
          garment_type TEXT NOT NULL,
          revision INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS local_order_drafts (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_outbox (
          operation_id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL
        );
      `),
    );

    databaseSetup.then(() => {
      if (isMounted) setLocalState('ready');
    }).catch((cause: unknown) => {
      if (!isMounted) return;
      setLocalError(cause instanceof Error ? cause.message : 'Local database setup failed');
      setLocalState('error');
    });

    Network.getNetworkStateAsync().then((state) => {
      if (isMounted) setOnline(state.isConnected === true && state.isInternetReachable !== false);
    }).catch(() => {
      if (isMounted) setOnline(null);
    });
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected === true && state.isInternetReachable !== false);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Tailoring operations</Text>
        <Text style={styles.title}>TailorApp</Text>
        <Text style={styles.subtitle}>A practical workspace for your tailoring team.</Text>
        <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.cardTitle}>Device status</Text>
          <Text style={styles.item}>
            {online === null ? 'Network status unavailable' : online ? 'Online' : 'Offline'}
          </Text>
          <Text style={styles.item}>
            {localState === 'ready' ? 'Offline storage ready' : localState === 'loading' ? 'Preparing offline storage…' : 'Offline storage unavailable'}
          </Text>
          {localError && <Text style={styles.error}>{localError}</Text>}
          <Text style={styles.note}>Mobile sign-in and tailor workflows are not enabled yet. Use the business admin to manage connected records.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f5' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#087f6b', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { marginTop: 6, color: '#102c27', fontSize: 36, fontWeight: '700' },
  subtitle: { marginTop: 8, color: '#5a6f69', fontSize: 16 },
  card: { marginTop: 28, padding: 22, borderColor: '#e1ebe7', borderWidth: 1, borderRadius: 18, backgroundColor: '#fff' },
  cardTitle: { marginBottom: 12, color: '#102c27', fontSize: 19, fontWeight: '600' },
  item: { marginVertical: 5, color: '#28463e', fontSize: 15 },
  note: { marginTop: 14, color: '#60736e', fontSize: 13, lineHeight: 19 },
  error: { marginTop: 10, color: '#a33a2a', fontSize: 13 },
});
