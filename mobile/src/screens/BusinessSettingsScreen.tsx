/**
 * Business settings — the shop-level configuration the owner or a manager can
 * change from the phone: business name and logo, enabled modules, payment
 * methods, dashboard widgets, item types, and team roles and members. Each section
 * saves through the business configuration API, which checks the version so
 * a stale copy cannot overwrite newer changes.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useAppStyles } from '../theme/useAppStyles';
import { useAppTheme } from '../theme/palette';
import { ActionButton, Field, StatusPill } from '../theme/primitives';
import { useWorkspace, type BusinessMember, type BusinessPermission, type BusinessRole } from '../hooks/useWorkspace';
import { itemTypeKeyFrom, sameList } from '../data/format';

type ToggleProps = { value: boolean; onToggle: (next: boolean) => void; disabled?: boolean };

function Toggle({ value, onToggle, disabled }: ToggleProps) {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      android_ripple={{ color: palette.primarySoft, borderless: true }}
      disabled={disabled}
      onPress={() => onToggle(!value)}
      style={[styles.toggleSwitch, value ? styles.toggleSwitchOn : styles.toggleSwitchOff, disabled && styles.disabled]}
    >
      <View style={styles.toggleKnob} />
    </Pressable>
  );
}

export function BusinessSettingsScreen() {
  const styles = useAppStyles();
  const { palette } = useAppTheme();
  const ws = useWorkspace();
  const copy = ws.copy;
  const config = ws.businessConfiguration;
  const canManage = ws.can('settings:manage');
  const canInvite = ws.can('staff:manage');
  const offline = ws.online !== true;

  const [businessName, setBusinessName] = useState(config?.business.name ?? '');
  const [logoUrl, setLogoUrl] = useState(config?.business.logoUrl ?? '');
  const [modules, setModules] = useState<string[]>(config?.enabledModules ?? []);
  const [methods, setMethods] = useState<string[]>(config?.paymentMethods ?? []);
  const [widgets, setWidgets] = useState<string[]>(config?.dashboardWidgets ?? []);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [roles, setRoles] = useState<BusinessRole[]>([]);
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [businessPermissions, setBusinessPermissions] = useState<BusinessPermission[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [teamNotice, setTeamNotice] = useState('');
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);

  // Reset drafts whenever a fresh configuration is loaded or saved.
  useEffect(() => {
    setBusinessName(config?.business.name ?? '');
    setLogoUrl(config?.business.logoUrl ?? '');
    setModules(config?.enabledModules ?? []);
    setMethods(config?.paymentMethods ?? []);
    setWidgets(config?.dashboardWidgets ?? []);
    // Keyed on the version: a background refresh with the same version keeps drafts.
  }, [config?.version, config?.business.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const reloadTeam = useCallback(async () => {
    if (!canInvite || offline) return;
    setTeamLoading(true);
    setTeamError('');
    try {
      const [nextRoles, nextMembers, nextPermissions] = await Promise.all([
        ws.fetchRoles(),
        ws.fetchBusinessStaff(),
        ws.fetchBusinessPermissions(),
      ]);
      setRoles(nextRoles);
      setMembers(nextMembers);
      setBusinessPermissions(nextPermissions);
      setInviteRoleId((current) => nextRoles.some((role) => role.id === current)
        ? current
        : nextRoles[0]?.id ?? '');
    } catch (failure) {
      setTeamError(failure instanceof Error ? failure.message : copy.error);
    } finally {
      setTeamLoading(false);
    }
  }, [canInvite, copy.error, offline, ws.fetchBusinessPermissions, ws.fetchBusinessStaff, ws.fetchRoles]);

  useEffect(() => {
    if (canInvite && !offline) void reloadTeam();
  }, [canInvite, offline, reloadTeam]);

  const toggle = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const saveAndConfirm = async (patch: Record<string, unknown>) => {
    const ok = await ws.saveBusinessConfiguration(patch);
    if (ok) Alert.alert(copy.saveSettings, copy.settingsSaved);
  };

  const trimmedName = businessName.trim();
  const trimmedLogo = logoUrl.trim();
  const brandingChanged = trimmedName !== (config?.business.name ?? '') || trimmedLogo !== (config?.business.logoUrl ?? '');
  const modulesChanged = !sameList(modules, config?.enabledModules ?? []);
  const methodsChanged = !sameList(methods, config?.paymentMethods ?? []);
  const widgetsChanged = !sameList(widgets, config?.dashboardWidgets ?? []);
  const itemTypes = config?.itemTypes ?? [];

  const addItemType = async () => {
    const label = newTypeLabel.trim();
    if (!label) return;
    const key = itemTypeKeyFrom(label, itemTypes.map((item) => item.key));
    const ok = await ws.saveBusinessConfiguration({ itemTypes: [...itemTypes, { key, label }] });
    if (ok) setNewTypeLabel('');
  };

  const createRole = async () => {
    const name = roleName.trim();
    if (name.length < 2) {
      setTeamError(copy.roleNameTooShort);
      return;
    }
    setTeamError('');
    setTeamNotice('');
    try {
      const createdRole = await ws.createBusinessRole({ name, permissions: rolePermissions });
      setRoleName('');
      setRolePermissions([]);
      setRoleEditorOpen(false);
      setInviteRoleId(createdRole.id);
      setTeamNotice(copy.roleCreated);
      await reloadTeam();
    } catch (failure) {
      setTeamError(failure instanceof Error ? failure.message : copy.error);
    }
  };

  const sendInvite = async () => {
    setTeamError('');
    setTeamNotice('');
    try {
      await ws.inviteStaffMember({
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        initialPassword: invitePassword,
        roleId: inviteRoleId,
      });
      setInviteName('');
      setInviteEmail('');
      setInvitePassword('');
      setInviteOpen(false);
      setTeamNotice(copy.inviteCreated);
      await reloadTeam();
      Alert.alert(copy.createMember, copy.inviteCreated);
    } catch (failure) {
      setTeamError(failure instanceof Error ? failure.message : copy.error);
    }
  };

  const inviteReady = inviteName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())
    && invitePassword.length >= 16 && roles.some((role) => role.id === inviteRoleId);

  return (
    <>
      <View style={styles.pageHeadingRow}>
        <View>
          <Text style={styles.pageTitle}>{copy.businessSettings}</Text>
          <Text style={styles.pageSubtitle}>{copy.businessSettingsSub}</Text>
        </View>
      </View>

      {offline ? <Text style={styles.errorText}>{copy.settingsOnline}</Text> : null}

      {/* Branding */}
      <View style={[styles.card, styles.cardAccentPrimary]}>
        <Text style={styles.sectionTitle}>{copy.branding}</Text>
        {canManage ? (
          <>
            <Field label={copy.businessName} value={businessName} onChangeText={setBusinessName} />
            <Field label={copy.logoUrl} value={logoUrl} onChangeText={setLogoUrl} helper="https://" />
            <ActionButton
              title={copy.saveSettings}
              secondary
              loading={ws.saving}
              loadingTitle={copy.loading}
              disabled={!brandingChanged || !trimmedName || offline || ws.saving}
              onPress={() => void saveAndConfirm({ business: { name: trimmedName, logoUrl: trimmedLogo || null } })}
            />
          </>
        ) : (
          <Text style={styles.listMeta}>{ws.session?.business.name ?? '—'}</Text>
        )}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{copy.primaryColor}</Text>
            <Text style={styles.toggleHint}>{ws.branding.primaryColor} · {copy.platformManaged}</Text>
          </View>
          <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: ws.branding.primaryColor }} />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{copy.loginTitle}</Text>
            <Text style={styles.toggleHint}>{ws.branding.loginTitle || '—'}</Text>
          </View>
        </View>
      </View>

      {/* Modules */}
      <View style={[styles.card, styles.cardAccentBlue]}>
        <Text style={styles.sectionTitle}>{copy.modules}</Text>
        {(config?.availableModules ?? []).map((m) => (
          <View key={m} style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{m}</Text>
            </View>
            <Toggle
              value={modules.includes(m)}
              disabled={!canManage || offline}
              onToggle={() => toggle(modules, setModules, m)}
            />
          </View>
        ))}
        {canManage ? (
          <ActionButton
            title={copy.saveSettings}
            secondary
            loading={ws.saving}
            loadingTitle={copy.loading}
            disabled={!modulesChanged || modules.length === 0 || offline || ws.saving}
            onPress={() => void saveAndConfirm({ enabledModules: modules })}
          />
        ) : null}
      </View>

      {/* Payment methods */}
      <View style={[styles.card, styles.cardAccentAmber]}>
        <Text style={styles.sectionTitle}>{copy.paymentMethodsLabel}</Text>
        <View style={styles.chipWrap}>
          {(config?.availablePaymentMethods ?? []).map((m) => {
            const on = methods.includes(m);
            return (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !canManage }}
                android_ripple={{ color: palette.primarySoft }}
                disabled={!canManage}
                onPress={() => toggle(methods, setMethods, m)}
                style={({ pressed }) => [styles.chip, on && styles.chipSelected, pressed && styles.chipPressed]}
              >
                <Text style={[styles.chipText, on && styles.chipTextSelected]}>{ws.paymentMethodLabel(m)}</Text>
              </Pressable>
            );
          })}
        </View>
        {canManage ? (
          <ActionButton
            title={copy.saveSettings}
            secondary
            loading={ws.saving}
            loadingTitle={copy.loading}
            disabled={!methodsChanged || methods.length === 0 || offline || ws.saving}
            onPress={() => void saveAndConfirm({ paymentMethods: methods })}
          />
        ) : null}
      </View>

      {/* Item types */}
      <View style={[styles.card, styles.cardAccentViolet]}>
        <Text style={styles.sectionTitle}>{copy.itemTypes}</Text>
        <View style={styles.chipWrap}>
          {itemTypes.map((t) => (
            <View key={t.key} style={[styles.chip, styles.chipSelected]}>
              <Text style={[styles.chipText, styles.chipTextSelected]}>{t.label}</Text>
            </View>
          ))}
        </View>
        {canManage ? (
          <>
            <Field label={copy.newItemTypeName} value={newTypeLabel} onChangeText={setNewTypeLabel} />
            <ActionButton
              title={`+ ${copy.addType}`}
              secondary
              loading={ws.saving}
              loadingTitle={copy.loading}
              disabled={!newTypeLabel.trim() || offline || ws.saving}
              onPress={() => void addItemType()}
            />
          </>
        ) : null}
      </View>

      {/* Dashboard widgets */}
      <View style={[styles.card, styles.cardAccentMint]}>
        <Text style={styles.sectionTitle}>{copy.dashboardWidgets}</Text>
        <View style={styles.chipWrap}>
          {(config?.availableDashboardWidgets ?? []).map((w) => {
            const on = widgets.includes(w);
            return (
              <Pressable
                key={w}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: !canManage }}
                android_ripple={{ color: palette.primarySoft }}
                disabled={!canManage}
                onPress={() => toggle(widgets, setWidgets, w)}
                style={({ pressed }) => [styles.chip, on && styles.chipSelected, pressed && styles.chipPressed]}
              >
                <Text style={[styles.chipText, on && styles.chipTextSelected]}>{w}</Text>
              </Pressable>
            );
          })}
        </View>
        {canManage ? (
          <ActionButton
            title={copy.saveSettings}
            secondary
            loading={ws.saving}
            loadingTitle={copy.loading}
            disabled={!widgetsChanged || offline || ws.saving}
            onPress={() => void saveAndConfirm({ dashboardWidgets: widgets })}
          />
        ) : null}
      </View>

      {/* Workflow stages (read-only on mobile; the web app edits the workflow) */}
      <View style={[styles.card, styles.cardAccentBlue]}>
        <Text style={styles.sectionTitle}>{copy.workflowStages}</Text>
        <View style={styles.chipWrap}>
          {(config?.workflow.stages ?? []).map((s, i) => (
            <View key={s.key} style={[styles.chip, i === 0 ? styles.chipSelected : null]}>
              <Text style={[styles.chipText, i === 0 ? styles.chipTextSelected : null]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Team */}
      <View style={[styles.card, styles.cardAccentAmber]}>
        <View style={styles.pageHeadingRow}>
          <Text style={styles.sectionTitle}>{copy.team}</Text>
          {canInvite ? (
            <Pressable
              accessibilityRole="button"
              disabled={offline || teamLoading}
              onPress={() => void reloadTeam()}
              style={({ pressed }) => [styles.teamRole, (offline || teamLoading) && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.teamRoleText}>{teamLoading ? copy.loading : copy.refreshTeam}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.teamRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(ws.session?.user.name ?? 'Y').slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.teamMain}>
            <Text style={styles.teamName}>{ws.session?.user.name ?? 'You'}</Text>
            <Text style={styles.teamMeta}>{ws.session?.user.email}</Text>
          </View>
          <StatusPill tone="mint">{copy.team}</StatusPill>
        </View>
        {canInvite ? (
          <>
            {teamError ? <Text accessibilityRole="alert" style={styles.errorText}>{teamError}</Text> : null}
            {teamNotice ? <Text accessibilityLiveRegion="polite" style={[styles.listMeta, { color: palette.success }]}>{teamNotice}</Text> : null}
            {teamLoading ? <Text style={styles.listMeta}>{copy.loadingTeam}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: roleEditorOpen, disabled: offline || ws.saving }}
              android_ripple={{ color: palette.primarySoft }}
              disabled={offline || ws.saving}
              onPress={() => { setRoleEditorOpen((open) => !open); setTeamError(''); }}
              style={({ pressed }) => [styles.teamRow, pressed && styles.pressed]}
            >
              <View style={[styles.avatar, { backgroundColor: palette.surfaceMuted }]}><Text style={styles.avatarText}>+</Text></View>
              <View style={styles.teamMain}>
                <Text style={styles.teamName}>{copy.createRole}</Text>
                <Text style={styles.teamMeta}>{copy.role} · {copy.permissions}</Text>
              </View>
            </Pressable>
            {roleEditorOpen ? (
              <View style={{ marginTop: 8 }}>
                <Field label={copy.roleName} value={roleName} onChangeText={setRoleName} maxLength={80} />
                <Text style={styles.fieldLabel}>{copy.permissions}</Text>
                <Text style={styles.toggleHint}>{copy.rolePermissionHint}</Text>
                {businessPermissions.map((permission) => {
                  const checked = rolePermissions.includes(permission.key);
                  const allowed = ws.can(permission.key);
                  return (
                    <View key={permission.key} style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>{permission.description}</Text>
                      <Toggle
                        value={checked}
                        disabled={!allowed}
                        onToggle={(next) => setRolePermissions((current) => next
                          ? [...new Set([...current, permission.key])]
                          : current.filter((key) => key !== permission.key))}
                      />
                    </View>
                  );
                })}
                <ActionButton
                  title={copy.createRole}
                  loading={ws.saving}
                  loadingTitle={copy.loading}
                  disabled={roleName.trim().length < 2 || roleName.trim().length > 80 || offline || ws.saving || teamLoading}
                  onPress={() => void createRole()}
                />
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>{copy.rolesLabel}</Text>
            {roles.length ? roles.map((role) => (
              <View key={role.id} style={styles.teamRow}>
                <View style={[styles.avatar, { backgroundColor: palette.surfaceMuted }]}><Text style={styles.avatarText}>{role.name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.teamMain}>
                  <Text style={styles.teamName}>{role.name}</Text>
                  <Text style={styles.teamMeta}>{role.memberCount} · {role.permissions.length} {copy.permissions.toLowerCase()}</Text>
                </View>
              </View>
            )) : !teamLoading ? <Text style={styles.listMeta}>{copy.noRoles}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: inviteOpen, disabled: offline || ws.saving }}
              android_ripple={{ color: palette.primarySoft }}
              disabled={offline || ws.saving}
              onPress={() => { setInviteOpen((open) => !open); setTeamError(''); }}
              style={({ pressed }) => [styles.teamRow, pressed && styles.pressed]}
            >
              <View style={[styles.avatar, { backgroundColor: palette.surfaceMuted }]}><Text style={styles.avatarText}>+</Text></View>
              <View style={styles.teamMain}>
                <Text style={styles.teamName}>{copy.createMember}</Text>
                <Text style={styles.teamMeta}>{copy.role} · {copy.temporaryPassword}</Text>
              </View>
            </Pressable>
            {inviteOpen ? (
              <View style={{ marginTop: 8 }}>
                <Field label={copy.inviteName} value={inviteName} onChangeText={setInviteName} maxLength={160} />
                <Field label={copy.email} value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" maxLength={254} />
                <Field label={copy.temporaryPassword} value={invitePassword} onChangeText={setInvitePassword} secureTextEntry maxLength={72} />
                <Text style={styles.fieldLabel}>{copy.role}</Text>
                <View style={styles.chipWrap}>
                  {roles.map((role) => {
                    const active = inviteRoleId === role.id;
                    return (
                      <Pressable
                        key={role.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        android_ripple={{ color: palette.primarySoft }}
                        onPress={() => setInviteRoleId(role.id)}
                        style={({ pressed }) => [styles.chip, active && styles.chipSelected, pressed && styles.chipPressed]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextSelected]}>{role.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {roles.length === 0 && !teamLoading ? <Text style={styles.listMeta}>{copy.noRoles}</Text> : null}
                <ActionButton
                  title={copy.createMember}
                  loading={ws.saving}
                  loadingTitle={copy.loading}
                  disabled={!inviteReady || offline || ws.saving || teamLoading}
                  onPress={() => void sendInvite()}
                />
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>{copy.teamMembers}</Text>
            {members.filter((member) => member.role.name !== 'Owner').length ? members
              .filter((member) => member.role.name !== 'Owner')
              .map((member) => (
                <View key={member.id} style={styles.teamRow}>
                  <View style={[styles.avatar, { backgroundColor: palette.surfaceMuted }]}><Text style={styles.avatarText}>{member.user.name.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={styles.teamMain}>
                    <Text style={styles.teamName}>{member.user.name}</Text>
                    <Text style={styles.teamMeta}>{member.user.email} · {member.role.name} · {member.active ? copy.activeMember : copy.removedMember}</Text>
                  </View>
                  <StatusPill tone={member.active ? 'mint' : 'muted'}>{member.active ? copy.activeMember : copy.removedMember}</StatusPill>
                </View>
              )) : !teamLoading ? <Text style={styles.listMeta}>{copy.noTeamMembers}</Text> : null}
          </>
        ) : null}
      </View>
    </>
  );
}
