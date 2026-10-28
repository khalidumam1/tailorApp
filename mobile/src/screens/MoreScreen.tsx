/**
 * More — hub for the screens that do not own a tab.
 *
 * Grouped into sections (Insights / Workspace / Account) so the list reads as
 * a menu rather than a wall of identical cards.
 */
import { Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { Avatar, Card, MenuRow, Section, type Tone } from '../theme/primitives';
import type { IconName } from '../Icons';
import { useWorkspace } from '../hooks/useWorkspace';
import type { NavPage, Navigate } from '../navigation';

type Item = { id: NavPage; label: string; hint: string; icon: IconName; tone: Tone; visible: boolean };

export function MoreScreen({ onNavigate }: { onNavigate: Navigate }) {
  const styles = useAppStyles();
  const ws = useWorkspace();
  const copy = ws.copy;

  const groups: Array<{ title: string; items: Item[] }> = [
    {
      title: copy.analytics,
      items: [
        {
          id: 'analytics',
          label: copy.analytics,
          hint: copy.reportAction,
          icon: 'chart',
          tone: 'brand',
          visible: ws.can('orders:read') && ws.moduleEnabled('orders') && ws.moduleEnabled('reports'),
        },
      ],
    },
    {
      title: copy.customizeWorkspace,
      items: [
        {
          id: 'customers',
          label: ws.term('customers', copy.customers),
          hint: copy.search,
          icon: 'customers',
          tone: 'info',
          visible: ws.can('customers:read') && ws.moduleEnabled('customers'),
        },
        {
          id: 'measurements',
          label: ws.term('measurements', copy.measurements),
          hint: copy.latestRevision,
          icon: 'measurements',
          tone: 'violet',
          visible: ws.can('measurements:read') && ws.moduleEnabled('measurements'),
        },
        {
          id: 'catalog',
          label: copy.catalog,
          hint: copy.catalogHint,
          icon: 'catalog',
          tone: 'amber',
          visible: ws.can('orders:read') && ws.moduleEnabled('catalog'),
        },
        {
          id: 'erp',
          label: 'Operations & finance',
          hint: 'Inventory, purchasing, cash and accounting',
          icon: 'building',
          tone: 'mint',
          visible: (ws.moduleEnabled('inventory') && ws.can('inventory:read'))
            || (ws.moduleEnabled('suppliers') && ws.can('suppliers:read'))
            || (ws.moduleEnabled('purchasing') && ws.can('purchasing:read'))
            || (ws.moduleEnabled('cashbook') && ws.can('cashbook:read'))
            || (ws.moduleEnabled('accounting') && ws.can('accounting:read')),
        },
      ],
    },
    {
      title: copy.settings,
      items: [
        {
          id: 'notifications',
          label: copy.notifications,
          hint: copy.notificationHistory,
          icon: 'notifications',
          tone: 'mint',
          visible: ws.can('notifications:read') && ws.moduleEnabled('notifications'),
        },
        {
          id: 'subscription',
          label: copy.subscription,
          hint: copy.subscriptionTitle,
          icon: 'subscription',
          tone: 'info',
          visible: ws.can('subscriptions:read'),
        },
        {
          id: 'business-settings',
          label: copy.businessSettings,
          hint: copy.customizeWorkspace,
          icon: 'settings',
          tone: 'muted',
          visible: ws.can('settings:manage'),
        },
        { id: 'guide', label: 'Help / User Guide', hint: 'Tutorials, glossary and FAQ', icon: 'spark', tone: 'violet', visible: true },
        { id: 'settings', label: copy.settings, hint: copy.appearance, icon: 'palette', tone: 'brand', visible: true },
      ],
    },
  ];

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <Avatar name={ws.session?.user.name ?? ws.branding.brandName} size="lg" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.pageTitle}>{ws.session?.user.name ?? copy.moreTab}</Text>
          <Text style={styles.pageSubtitle}>
            {ws.branding.brandName} · {ws.session?.business.name}
          </Text>
        </View>
      </View>

      {groups
        .map((group) => ({ ...group, items: group.items.filter((item) => item.visible) }))
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <View key={group.title} style={{ marginBottom: 6 }}>
            <Section title={group.title}>
              <Card style={{ padding: 6 }}>
                {group.items.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <MenuRow
                      icon={item.icon}
                      title={item.label}
                      meta={item.hint}
                      tone={item.tone}
                      onPress={() => onNavigate(item.id)}
                    />
                  </View>
                ))}
              </Card>
            </Section>
          </View>
        ))}
    </>
  );
}
