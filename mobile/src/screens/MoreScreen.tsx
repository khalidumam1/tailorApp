/**
 * More — Payrio-style hub for screens that don't deserve their own tab:
 * measurements, notifications, subscription, settings, business settings,
 * activity / analytics.
 */
import { Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { Icon, type IconName } from '../Icons';
import { useWorkspace } from '../hooks/useWorkspace';
import type { Page } from '../hooks/useWorkspace';

type MoreItem = {
  id: Page;
  label: string;
  hint: string;
  icon: IconName;
  tone: 'primary' | 'mint' | 'amber' | 'blue' | 'violet' | 'red';
};

export function MoreScreen({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;

  const items: MoreItem[] = ([
    { id: 'analytics' as Page, label: copy.analytics, hint: copy.reportAction, icon: 'chart' as IconName, tone: 'primary' as const },
    { id: 'measurements' as Page, label: copy.measurements, hint: 'Customer measurement revisions', icon: 'measurements' as IconName, tone: 'violet' as const },
    { id: 'notifications' as Page, label: copy.notifications, hint: copy.notificationHistory, icon: 'notifications' as IconName, tone: 'mint' as const },
    { id: 'catalog' as Page, label: 'Catalog', hint: 'Saved items & types', icon: 'catalog' as IconName, tone: 'amber' as const },
    { id: 'subscription' as Page, label: copy.subscription, hint: copy.subscriptionTitle, icon: 'subscription' as IconName, tone: 'blue' as const },
    { id: 'business-settings' as Page, label: copy.businessSettings, hint: copy.customizeWorkspace, icon: 'settings' as IconName, tone: 'red' as const },
    { id: 'settings' as Page, label: copy.settings, hint: copy.appearance, icon: 'palette' as IconName, tone: 'primary' as const },
  ] as const).filter((item) => {
    // Hide screens the user doesn't have permission for.
    if (item.id === 'measurements') return ws.can('measurements:read') && ws.moduleEnabled('measurements');
    if (item.id === 'notifications') return ws.can('notifications:read') && ws.moduleEnabled('notifications');
    if (item.id === 'catalog') return ws.can('orders:read') && ws.moduleEnabled('catalog');
    if (item.id === 'subscription') return ws.can('subscriptions:read');
    return true;
  });

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.moreTab}</Text>
          <Text style={styles.pageSubtitle}>{ws.branding.brandName} · {ws.session?.business.name}</Text>
        </View>
      </View>
      {items.map((item) => (
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

function iconDotStyle(styles: ReturnType<typeof useAppStyles>, tone: 'primary' | 'mint' | 'amber' | 'blue' | 'violet' | 'red') {
  switch (tone) {
    case 'mint': return styles.iconDotMint;
    case 'amber': return styles.iconDotAmber;
    case 'blue': return styles.iconDotBlue;
    case 'violet': return styles.iconDotViolet;
    case 'red': return styles.iconDotRed;
    default: return styles.iconDot;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
void capitalize; // silence "unused" warning when refactored

function iconColor(palette: any, tone: 'primary' | 'mint' | 'amber' | 'blue' | 'violet' | 'red'): string {
  switch (tone) {
    case 'mint': return palette.success;
    case 'amber': return palette.warning;
    case 'blue': return palette.info;
    case 'violet': return '#a995e0';
    case 'red': return palette.danger;
    default: return palette.primaryText;
  }
}
