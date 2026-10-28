/**
 * Bottom tab bar — five destinations on a solid surface with a hairline top
 * border. The active tab sits in a tinted pill so position is obvious at a
 * glance without relying on colour alone.
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
              android_ripple={{ color: palette.brand50, borderless: true }}
              onPress={() => onChange(tab.key)}
              style={({ pressed }) => [styles.tab, isActive && styles.tabActive, pressed && styles.tabPressed]}
            >
              <Icon name={tab.icon} size={21} color={isActive ? palette.brand700 : palette.ink400} />
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
