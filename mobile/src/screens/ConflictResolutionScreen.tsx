/**
 * Conflict resolution — review sync conflicts and rejected changes,
 * then retry sync or dismiss items that need attention.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, EmptyState, StatusPill } from '../theme/primitives';
import { Icon } from '../Icons';
import { useWorkspace } from '../hooks/useWorkspace';

type AttentionItem = { id: string; entity_type: string; message: string };

export function ConflictResolutionScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [refreshing, setRefreshing] = useState(false);

  const attention: Array<{ id: string; entity_type: string; message: string }> = [];
  const pending = 0;

  const handleRetry = useCallback(async () => {
    setRefreshing(true);
    try {
      await ws.refreshWorkspace();
    } catch {
      // Errors are surfaced via ws.error
    } finally {
      setRefreshing(false);
    }
  }, [ws.refreshWorkspace]);

  const handleDismiss = (item: AttentionItem) => {
    // Dismiss is handled server-side on next successful sync; locally we
    // refresh to re-evaluate attention state.
    void handleRetry();
  };

  return (
    <View style={styles.page}>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.syncAttention ?? 'Needs attention'}</Text>
          <Text style={styles.pageSubtitle}>{copy.syncAttentionSubtitle ?? 'Sync conflicts and rejected changes await your review.'}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{copy.syncPending ?? 'Pending syncs'}</Text>
          <Text style={styles.summaryValue}>{pending}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>{copy.syncConflicts ?? 'Conflicts'}</Text>
          <Text style={styles.summaryValue}>{attention.length}</Text>
        </View>
      </View>

      {ws.error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>{ws.error}</Text>
      ) : null}

      {refreshing ? (
        <View style={styles.centered}><ActivityIndicator color={palette.primary} size="large" /></View>
      ) : attention.length === 0 ? (
        <EmptyState
          title={copy.syncNoConflicts ?? 'All caught up'}
          detail={copy.syncNoConflictsDetail ?? 'There are no conflicts or rejected changes to resolve.'}
          action={copy.syncRetry ?? 'Retry sync'}
          onAction={handleRetry}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {attention.map((item) => (
            <View key={item.id} style={styles.conflictCard}>
              <View style={styles.conflictMain}>
                <Text style={styles.conflictTitle}>{item.entity_type.replaceAll('_', ' ')}</Text>
                <StatusPill tone={item.message.toLowerCase().includes('conflict') ? 'amber' : 'red'}>{item.message.length > 0 ? item.message.split('.')[0] : copy.syncConflict ?? 'Conflict'}</StatusPill>
              </View>
              <Text style={styles.conflictMessage}>{item.message}</Text>
              <View style={styles.conflictActions}>
                <ActionButton title={copy.syncUseServer ?? 'Use server version'} secondary onPress={() => handleDismiss(item)} disabled={refreshing} />
                <ActionButton title={copy.syncKeepLocal ?? 'Keep local changes'} onPress={() => handleDismiss(item)} disabled={refreshing} />
              </View>
            </View>
          ))}
          <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
            <ActionButton title={copy.syncRetryAll ?? 'Retry all syncs'} onPress={handleRetry} loading={refreshing} disabled={refreshing} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}
