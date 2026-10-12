/**
 * Activity — combined hub for analytics, WhatsApp delivery, measurements.
 * The Payrio "Activity" tab gives the user a single place to check the
 * pulse of the shop without leaving the main navigation.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { useWorkspace } from '../hooks/useWorkspace';
import { AnalyticsScreen } from './AnalyticsScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { MeasurementsScreen } from './MeasurementsScreen';

type SubTab = 'analytics' | 'whatsapp' | 'measurements';

export function ActivityScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const [tab, setTab] = useState<SubTab>('analytics');

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.activityTab}</Text>
          <Text style={styles.pageSubtitle}>{copy.customizeWorkspace}</Text>
        </View>
      </View>
      <View style={styles.chipWrap}>
        {([
          { key: 'analytics' as const, label: copy.analytics },
          { key: 'whatsapp' as const, label: copy.notifications },
          { key: 'measurements' as const, label: copy.measurements },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              android_ripple={{ color: palette.primarySoft }}
              onPress={() => setTab(t.key)}
              style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
            >
              <Text style={[styles.chipText, active && styles.chipTextSelected]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* The inner screens include their own page headings; that is the
          intended visual when a single activity sub-tab is in focus. */}
      {tab === 'analytics' ? <AnalyticsScreen /> : null}
      {tab === 'whatsapp' ? <NotificationsScreen /> : null}
      {tab === 'measurements' ? <MeasurementsScreen /> : null}
    </>
  );
}
