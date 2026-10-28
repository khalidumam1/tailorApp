/**
 * App header — workspace identity, search entry point and notifications.
 *
 * Reads as a console header: brand mark, business name under the product name,
 * then a search field. A dot on the bell reflects queued notification history.
 */
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../Icons';
import { ApplicationMark } from '../theme/primitives';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { useWorkspace } from '../hooks/useWorkspace';

type HeaderProps = {
  onNotificationsPress?: () => void;
  onSearchPress?: () => void;
};

export function Header({ onNotificationsPress, onSearchPress }: HeaderProps) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const hasNotifications = ws.notificationHistory.length > 0;

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.headerBrand}>
          <ApplicationMark />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow} numberOfLines={1}>{ws.branding.brandName}</Text>
            <Text style={styles.headerBrandName} numberOfLines={1}>{ws.session?.business.name ?? '—'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ws.copy.notificationHistory}
            onPress={onNotificationsPress}
            android_ripple={{ color: palette.brand50, borderless: true }}
            style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
          >
            <Icon name="bell" size={20} color={palette.brand700} />
            {hasNotifications ? <View style={styles.bellBadge} /> : null}
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={ws.copy.searchPlaceholder}
        android_ripple={{ color: palette.brand50 }}
        onPress={onSearchPress}
        style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}
      >
        <Icon name="search" size={18} color={palette.ink400} />
        <Text style={styles.searchPillText} numberOfLines={1}>{ws.copy.searchPlaceholder}</Text>
      </Pressable>
    </View>
  );
}
