/**
 * More — clean hub for screens that don't have their own tab.
 * Each row opens its page with a back control.
 */
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { useWorkspace } from '../hooks/useWorkspace';
import type { NavPage, Navigate } from '../navigation';

type Tone = 'primary' | 'mint' | 'amber' | 'blue' | 'violet' | 'red';

export function MoreScreen({ onNavigate }: { onNavigate: Navigate }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  const items: Array<{ id: NavPage; label: string; hint: string; icon: IconName; tone: Tone; visible: boolean }> = [
    { id: 'analytics', label: copy.analytics, hint: copy.reportAction, icon: 'chart', tone: 'primary', visible: ws.can('orders:read') && ws.moduleEnabled('orders') && ws.moduleEnabled('reports') },
    { id: 'customers', label: ws.term('customers', copy.customers), hint: copy.search, icon: 'customers', tone: 'blue', visible: ws.can('customers:read') && ws.moduleEnabled('customers') },
    { id: 'measurements', label: ws.term('measurements', copy.measurements), hint: copy.latestRevision, icon: 'measurements', tone: 'violet', visible: ws.can('measurements:read') && ws.moduleEnabled('measurements') },
    { id: 'notifications', label: copy.notifications, hint: copy.notificationHistory, icon: 'notifications', tone: 'mint', visible: ws.can('notifications:read') && ws.moduleEnabled('notifications') },
    { id: 'catalog', label: copy.catalog, hint: copy.catalogHint, icon: 'catalog', tone: 'amber', visible: ws.can('orders:read') && ws.moduleEnabled('catalog') },
    { id: 'erp', label: 'Operations & finance', hint: 'Inventory, purchasing, cash and accounting', icon: 'building', tone: 'mint', visible: (ws.moduleEnabled('inventory') && ws.can('inventory:read')) || (ws.moduleEnabled('suppliers') && ws.can('suppliers:read')) || (ws.moduleEnabled('purchasing') && ws.can('purchasing:read')) || (ws.moduleEnabled('cashbook') && ws.can('cashbook:read')) || (ws.moduleEnabled('accounting') && ws.can('accounting:read')) },
    { id: 'subscription', label: copy.subscription, hint: copy.subscriptionTitle, icon: 'subscription', tone: 'blue', visible: ws.can('subscriptions:read') },
    { id: 'business-settings', label: copy.businessSettings, hint: copy.customizeWorkspace, icon: 'settings', tone: 'red', visible: ws.can('settings:manage') },
    { id: 'settings', label: copy.settings, hint: copy.appearance, icon: 'palette', tone: 'primary', visible: true },
  ];

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.moreTab}</Text>
          <Text style={styles.pageSubtitle}>{ws.branding.brandName} · {ws.session?.business.name}</Text>
        </View>
      </View>
      {items.filter((item) => item.visible).map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          android_ripple={{ color: palette.primarySoft }}
          onPress={() => onNavigate(item.id)}
          style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}
        >
          <View style={[styles.iconDot, iconDotStyle(styles, item.tone)]}>
            <Icon name={item.icon} size={20} color={iconColor(palette, item.tone)} />
          </View>
          <View style={styles.listMain}>
            <Text style={styles.listTitle}>{item.label}</Text>
            <Text style={styles.listMeta}>{item.hint}</Text>
          </View>
          <Icon name="arrowRight" size={20} color={palette.mutedText} />
        </Pressable>
      ))}
    </>
  );
}

function iconDotStyle(styles: ReturnType<typeof useAppStyles>, tone: Tone) {
  switch (tone) {
    case 'mint': return styles.iconDotMint;
    case 'amber': return styles.iconDotAmber;
    case 'blue': return styles.iconDotBlue;
    case 'violet': return styles.iconDotViolet;
    case 'red': return styles.iconDotRed;
    default: return styles.iconDot;
  }
}

function iconColor(palette: ReturnType<typeof useAppTheme>['palette'], tone: Tone): string {
  switch (tone) {
    case 'mint': return palette.success;
    case 'amber': return palette.warning;
    case 'blue': return palette.info;
    case 'violet': return '#a995e0';
    case 'red': return palette.danger;
    default: return palette.primaryText;
  }
}
