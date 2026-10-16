/**
 * Standard bottom tab bar — simple, clean, fixed at bottom.
 * No glassmorphism, no floating effect, just a clean navigation bar.
 */
import { Pressable, Text, View } from 'react-native';
import { Icon, type IconName } from '../Icons';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';

export type TabKey = 'home' | 'orders' | 'payments' | 'activity' | 'more';

export type TabDescriptor = {
  key: TabKey;
  label: string;
  icon: IconName;
};

type TabBarProps = {
  tabs: TabDescriptor[];
  active: TabKey;
  onChange: (next: TabKey) => void;
};

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  return (
    <View style={styles.tabBarWrap}>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              android_ripple={{ color: palette.primarySoft, borderless: true }}
              onPress={() => onChange(tab.key)}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            >
              <Icon name={tab.icon} size={22} color={isActive ? palette.primary : palette.mutedText} />
              <Text numberOfLines={1} style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
