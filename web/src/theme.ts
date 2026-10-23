export type ColorModePreference = "light" | "dark" | "system";
export type AccentPreset =
  "lime" | "blue" | "violet" | "amber" | "rose" | "brand";
export type RadiusPreference = "none" | "sm" | "md" | "lg";
export type ScalePreference = "sm" | "md" | "lg";
export type ContentPreference = "compact" | "full";
export type SidebarVariant = "default" | "inset" | "floating";
export type SidebarMode = "full" | "icon";
export type FontPreference = "mono" | "sans";

export interface InterfacePreferences {
  accent: AccentPreset;
  radius: RadiusPreference;
  scale: ScalePreference;
  content: ContentPreference;
  sidebarVariant: SidebarVariant;
  sidebarMode: SidebarMode;
  font: FontPreference;
}

export const INTERFACE_PREFERENCES_STORAGE_KEY = "tailorapp.interface.v1";

export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = {
  accent: "lime",
  radius: "lg",
  scale: "md",
  content: "compact",
  sidebarVariant: "floating",
  sidebarMode: "full",
  font: "mono",
};

export const ACCENT_PRESETS: Array<{
  key: AccentPreset;
  label: string;
  color?: string;
}> = [
  { key: "lime", label: "Lime", color: "#a3e635" },
  { key: "blue", label: "Blue", color: "#3b82f6" },
  { key: "violet", label: "Violet", color: "#8b5cf6" },
  { key: "amber", label: "Amber", color: "#f59e0b" },
  { key: "rose", label: "Rose", color: "#f43f5e" },
  { key: "brand", label: "Business brand" },
];

const allowedValues = {
  accent: ACCENT_PRESETS.map((preset) => preset.key),
  radius: ["none", "sm", "md", "lg"],
  scale: ["sm", "md", "lg"],
  content: ["compact", "full"],
  sidebarVariant: ["default", "inset", "floating"],
  sidebarMode: ["full", "icon"],
  font: ["mono", "sans"],
} as const;

function validValue<Key extends keyof typeof allowedValues>(
  key: Key,
  value: unknown,
): InterfacePreferences[Key] | undefined {
  return (allowedValues[key] as readonly unknown[]).includes(value)
    ? (value as InterfacePreferences[Key])
    : undefined;
}

export function loadInterfacePreferences(): InterfacePreferences {
  try {
    const serialized = localStorage.getItem(INTERFACE_PREFERENCES_STORAGE_KEY);
    if (!serialized) return { ...DEFAULT_INTERFACE_PREFERENCES };
    const stored = JSON.parse(serialized) as Partial<InterfacePreferences>;
    return {
      accent: validValue("accent", stored.accent) ?? DEFAULT_INTERFACE_PREFERENCES.accent,
      radius: validValue("radius", stored.radius) ?? DEFAULT_INTERFACE_PREFERENCES.radius,
      scale: validValue("scale", stored.scale) ?? DEFAULT_INTERFACE_PREFERENCES.scale,
      content: validValue("content", stored.content) ?? DEFAULT_INTERFACE_PREFERENCES.content,
      sidebarVariant: validValue("sidebarVariant", stored.sidebarVariant) ?? DEFAULT_INTERFACE_PREFERENCES.sidebarVariant,
      sidebarMode: validValue("sidebarMode", stored.sidebarMode) ?? DEFAULT_INTERFACE_PREFERENCES.sidebarMode,
      font: validValue("font", stored.font) ?? DEFAULT_INTERFACE_PREFERENCES.font,
    };
  } catch {
    return { ...DEFAULT_INTERFACE_PREFERENCES };
  }
}

export function accentColorFor(
  preferences: InterfacePreferences,
  brandColor: string,
): string {
  return (
    ACCENT_PRESETS.find((preset) => preset.key === preferences.accent)?.color ??
    brandColor
  );
}
