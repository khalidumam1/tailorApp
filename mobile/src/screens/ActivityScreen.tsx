/**
 * Activity — sub-hub that hosts analytics, WhatsApp delivery and measurements
 * under one tab, switched with a segmented control.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { Segmented } from '../theme/primitives';
import { useWorkspace } from '../hooks/useWorkspace';
import { AnalyticsScreen } from './AnalyticsScreen';
import { NotificationsScreen } from './NotificationsScreen';
import { MeasurementsScreen } from './MeasurementsScreen';

type SubTab = 'analytics' | 'whatsapp' | 'measurements';

export function ActivityScreen() {
  const styles = useAppStyles();
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
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{copy.activityTab}</Text>
          <Text style={styles.pageSubtitle}>{copy.analytics}</Text>
        </View>
      </View>

      {tabs.length > 1 ? (
        <Segmented<SubTab>
          options={tabs.map((item) => ({ key: item.key, label: item.label }))}
          value={activeTab ?? 'analytics'}
          onChange={setTab}
        />
      ) : null}

      {activeTab === 'analytics' ? <AnalyticsScreen /> : null}
      {activeTab === 'whatsapp' ? <NotificationsScreen /> : null}
      {activeTab === 'measurements' ? <MeasurementsScreen /> : null}
    </>
  );
}
