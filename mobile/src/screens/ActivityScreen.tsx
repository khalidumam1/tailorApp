/**
 * Activity — combined hub for analytics, WhatsApp delivery, measurements.
 * Simple sub-tab navigation.
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
  const tabs = [
    { key: 'analytics' as const, label: copy.analytics, visible: ws.can('orders:read') && ws.moduleEnabled('orders') && ws.moduleEnabled('reports') },
    { key: 'whatsapp' as const, label: copy.notifications, visible: ws.can('notifications:read') && ws.moduleEnabled('notifications') },
    { key: 'measurements' as const, label: ws.term('measurements', copy.measurements), visible: ws.can('measurements:read') && ws.moduleEnabled('measurements') },
  ].filter((item) => item.visible);
  const activeTab = tabs.some((item) => item.key === tab) ? tab : tabs[0]?.key;

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.activityTab}</Text>
          <Text style={styles.pageSubtitle}>{copy.customizeWorkspace}</Text>
        </View>
      </View>
      <View style={styles.chipWrap}>
        {tabs.map((t) => {
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
      {activeTab === 'analytics' ? <AnalyticsScreen /> : null}
      {activeTab === 'whatsapp' ? <NotificationsScreen /> : null}
      {activeTab === 'measurements' ? <MeasurementsScreen /> : null}
    </>
  );
}
