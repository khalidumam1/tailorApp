/**
 * Floating 5-tab glass tab bar (Payrio-style). It is fixed to the bottom of
 * the workspace with horizontal padding and a soft shadow so it sits above
 * the scroll content. The label is part of every tab; the active tab uses
 * the primary soft pill background.
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
    <View pointerEvents="box-none" style={styles.tabBarWrap}>
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
              style={({ pressed }) => [styles.tab, isActive && styles.tabActive, pressed && styles.tabPressed]}
            >
              <Icon name={tab.icon} size={22} color={isActive ? palette.glassBarTextActive : palette.glassBarText} />
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
