import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";
import {
  ACCENT_PRESETS,
  type ColorModePreference,
  type ContentPreference,
  type FontPreference,
  type InterfacePreferences,
  type RadiusPreference,
  type ScalePreference,
  type SidebarMode,
  type SidebarVariant,
} from "./theme";

interface ThemeStudioProps {
  preferences: InterfacePreferences;
  colorMode: ColorModePreference;
  onChange: (patch: Partial<InterfacePreferences>) => void;
  onColorModeChange: (mode: ColorModePreference) => void;
  onReset: () => void;
}

function ChoiceGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: Array<{ value: Value; label: string }>;
  onChange: (value: Value) => void;
}) {
  return (
    <div className="theme-studio-field">
      <span className="theme-studio-label">{label}</span>
      <div className="theme-studio-choices" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={
              value === option.value ? "theme-choice is-active" : "theme-choice"
            }
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StudioSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="theme-studio-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function ThemeStudio({
  preferences,
  colorMode,
  onChange,
  onColorModeChange,
  onReset,
}: ThemeStudioProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="button button-secondary theme-studio-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icon name="settings" />
        <span>Customize</span>
      </button>
      {open && createPortal(
        <div
          className="theme-studio-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <aside
            ref={dialogRef}
            className="theme-studio"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-studio-title"
          >
            <header className="theme-studio-header">
              <div>
                <p className="eyebrow">Live appearance</p>
                <h2 id="theme-studio-title">Theme studio</h2>
                <p className="muted">
                  Tune the workspace without changing any business data.
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="dialog-close"
                aria-label="Close theme studio"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="theme-studio-body">
              <StudioSection title="Color & type">
                <ChoiceGroup<ColorModePreference>
                  label="Color mode"
                  value={colorMode}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "system", label: "System" },
                  ]}
                  onChange={onColorModeChange}
                />
                <div className="theme-studio-field">
                  <span className="theme-studio-label">Accent preset</span>
                  <div
                    className="theme-accent-grid"
                    role="group"
                    aria-label="Accent preset"
                  >
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        className={
                          preferences.accent === preset.key
                            ? "theme-accent is-active"
                            : "theme-accent"
                        }
                        aria-pressed={preferences.accent === preset.key}
                        onClick={() => onChange({ accent: preset.key })}
                      >
                        <span
                          className={`theme-accent-swatch ${preset.key === "brand" ? "is-brand" : ""}`}
                          style={{
                            background:
                              preset.color ?? "var(--brand-color, #117a5c)",
                          }}
                          aria-hidden="true"
                        />
                        <span>{preset.label}</span>
                        {preferences.accent === preset.key && (
                          <Icon name="check" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <ChoiceGroup<FontPreference>
                  label="Interface font"
                  value={preferences.font}
                  options={[
                    { value: "mono", label: "Technical mono" },
                    { value: "sans", label: "Clean sans" },
                  ]}
                  onChange={(font) => onChange({ font })}
                />
              </StudioSection>

              <StudioSection title="Shape & density">
                <ChoiceGroup<RadiusPreference>
                  label="Corner radius"
                  value={preferences.radius}
                  options={[
                    { value: "none", label: "None" },
                    { value: "sm", label: "SM" },
                    { value: "md", label: "MD" },
                    { value: "lg", label: "LG" },
                  ]}
                  onChange={(radius) => onChange({ radius })}
                />
                <ChoiceGroup<ScalePreference>
                  label="Interface scale"
                  value={preferences.scale}
                  options={[
                    { value: "sm", label: "Compact" },
                    { value: "md", label: "Default" },
                    { value: "lg", label: "Large" },
                  ]}
                  onChange={(scale) => onChange({ scale })}
                />
                <ChoiceGroup<ContentPreference>
                  label="Content width"
                  value={preferences.content}
                  options={[
                    { value: "compact", label: "Contained" },
                    { value: "full", label: "Full width" },
                  ]}
                  onChange={(content) => onChange({ content })}
                />
              </StudioSection>

              <StudioSection title="Navigation">
                <ChoiceGroup<SidebarVariant>
                  label="Sidebar variant"
                  value={preferences.sidebarVariant}
                  options={[
                    { value: "floating", label: "Floating" },
                    { value: "inset", label: "Inset" },
                    { value: "default", label: "Attached" },
                  ]}
                  onChange={(sidebarVariant) => onChange({ sidebarVariant })}
                />
                <ChoiceGroup<SidebarMode>
                  label="Sidebar mode"
                  value={preferences.sidebarMode}
                  options={[
                    { value: "full", label: "Labels" },
                    { value: "icon", label: "Icons only" },
                  ]}
                  onChange={(sidebarMode) => onChange({ sidebarMode })}
                />
              </StudioSection>
            </div>

            <footer className="theme-studio-footer">
              <p className="fine-print">
                Saved in this browser. Choose Business brand to use the
                platform’s configured color.
              </p>
              <button
                type="button"
                className="button button-secondary"
                onClick={onReset}
              >
                <Icon name="progress" /> Reset appearance
              </button>
            </footer>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
