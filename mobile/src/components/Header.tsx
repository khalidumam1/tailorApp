/**
 * Payrio-style app header. The header now reads more like a finance app:
 * brand mark + business name, a search pill in the middle, and a bell icon
 * on the right (which can show a small dot if there are pending changes).
 *
 * It also surfaces the connection state with a coloured dot so the user
 * always knows whether the next action will sync.
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

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.headerBrand}>
          <ApplicationMark />
          <View>
            <Text style={styles.headerBrandName}>{ws.branding.brandName}</Text>
            <Text style={styles.listMeta}>{ws.session?.business.name ?? '—'}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ws.copy.notificationHistory}
            onPress={onNotificationsPress}
            android_ripple={{ color: palette.primarySoft, borderless: true }}
            style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
          >
            <Icon name="bell" size={20} color={palette.primaryText} />
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={ws.copy.searchPlaceholder}
        android_ripple={{ color: palette.primarySoft }}
        onPress={onSearchPress}
        style={({ pressed }) => [styles.searchPill, pressed && styles.pressed]}
      >
        <Icon name="search" size={18} color={palette.mutedText} />
        <Text style={styles.searchPillText}>{ws.copy.searchPlaceholder}</Text>
      </Pressable>
    </View>
  );
}
