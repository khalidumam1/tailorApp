import { useEffect, useState } from 'react';
import { api, type BusinessMember, type BusinessPermission, type BusinessRole } from './api';

type Props = {
  canManage: boolean;
  online: boolean;
  actorPermissions: string[];
  withSession: <T,>(action: (token: string) => Promise<T>) => Promise<T>;
};

export function BusinessTeamAdmin({ canManage, online, actorPermissions, withSession }: Props) {
  const [roles, setRoles] = useState<BusinessRole[]>([]);
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [permissions, setPermissions] = useState<BusinessPermission[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState({ name: '', email: '', initialPassword: '', roleId: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [roleResult, memberResult, permissionResult] = await Promise.all([
        withSession(api.businessRoles),
        withSession(api.businessStaff),
        withSession(api.businessPermissions),
      ]);
      setRoles(roleResult.items);
      setMembers(memberResult.items);
      setPermissions(permissionResult.items);
      setMemberDraft((current) => ({
        ...current,
        roleId: roleResult.items.some((role) => role.id === current.roleId)
          ? current.roleId
          : roleResult.items[0]?.id ?? '',
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load business team.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canManage) void reload();
  }, [canManage, withSession]);

  function editRole(role: BusinessRole) {
    setRoleId(role.id);
    setRoleName(role.name);
    setRolePermissions(role.permissions);
    setNotice(null);
  }

  async function saveRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      if (roleId) await withSession((token) => api.updateBusinessRole(token, roleId, { name: roleName, permissions: rolePermissions }));
      else await withSession((token) => api.createBusinessRole(token, { name: roleName, permissions: rolePermissions }));
      setRoleId(null);
      setRoleName('');
      setRolePermissions([]);
      setNotice('Business role saved.');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save business role.');
    } finally {
      setWorking(false);
    }
  }

  async function removeRole(role: BusinessRole) {
    if (!window.confirm(`Remove role "${role.name}"?`)) return;
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.deleteBusinessRole(token, role.id));
      if (roleId === role.id) {
        setRoleId(null);
        setRoleName('');
        setRolePermissions([]);
      }
      setNotice('Business role removed.');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove business role.');
    } finally {
      setWorking(false);
    }
  }

  async function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await withSession((token) => api.createBusinessStaff(token, memberDraft));
      setMemberDraft((current) => ({ ...current, name: '', email: '', initialPassword: '' }));
      setNotice('Business team member created.');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create team member.');
    } finally {
      setWorking(false);
    }
  }

  async function updateMember(member: BusinessMember, change: { roleId?: string; active?: boolean }) {
    setWorking(true);
    setError(null);
    try {
      const updated = await withSession((token) => api.updateBusinessStaff(token, member.id, change));
      setMembers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${updated.user.name}'s business access was updated.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update business access.');
    } finally {
      setWorking(false);
    }
  }

  async function removeMember(member: BusinessMember) {
    if (!window.confirm(`Remove ${member.user.name} from this business?\n\nThey are signed out immediately and cannot open this business again. Customers, orders and payments stay untouched.`)) return;
    setWorking(true);
    setError(null);
    try {
      const updated = await withSession((token) => api.removeBusinessStaff(token, member.id));
      setMembers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(`${updated.user.name} was removed from the business and signed out of it.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove this member.');
    } finally {
      setWorking(false);
    }
  }

  if (!canManage) return null;

  return (
    <section className="content-stack business-team-admin" aria-labelledby="business-team-title">
      <div className="section-heading">
        <div><h3 id="business-team-title">Team and roles</h3><p className="muted">Create business-scoped access and grant only permissions you hold.</p></div>
        <button className="button button-secondary" type="button" disabled={loading || !online} onClick={() => void reload()}>Refresh</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {loading ? <p className="muted">Loading business team…</p> : (
        <>
          <section className="panel form-panel">
            <h4>{roleId ? 'Edit role' : 'Create role'}</h4>
            <form className="content-stack" onSubmit={saveRole}>
              <label>Role name<input value={roleName} onChange={(event) => setRoleName(event.target.value)} maxLength={80} minLength={2} required /></label>
              <div className="configuration-options">
                {permissions.map((permission) => (
                  <label className="checkbox-row" key={permission.key} title={permission.description}>
                    <input
                      type="checkbox"
                      checked={rolePermissions.includes(permission.key)}
                      disabled={!actorPermissions.includes(permission.key) && !rolePermissions.includes(permission.key)}
                      aria-label={`${permission.description}${actorPermissions.includes(permission.key) ? '' : ' (you cannot grant this permission)'}`}
                      onChange={(event) => setRolePermissions((current) => event.target.checked
                        ? [...new Set([...current, permission.key])]
                        : current.filter((key) => key !== permission.key))}
                    />
                    {permission.description}
                  </label>
                ))}
              </div>
              <div className="row-actions">
                <button className="button button-primary" disabled={working || !online}>{working ? 'Saving…' : 'Save role'}</button>
                {roleId && <button className="button button-quiet" type="button" onClick={() => { setRoleId(null); setRoleName(''); setRolePermissions([]); }}>Cancel edit</button>}
              </div>
            </form>
            {roles.map((role) => (
              <article className="business-role-row" key={role.id}>
                <div><strong>{role.name}</strong><small className="table-note">Workflow key: {role.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '')} · {role.memberCount ?? 0} members · {role.permissions.length} permissions{role.isSystem ? ' · system role' : ''}</small></div>
                <div className="row-actions">
                  <button className="button button-secondary" type="button" disabled={role.isSystem} onClick={() => editRole(role)}>Edit</button>
                  {!role.isSystem && <button className="button button-danger-quiet" type="button" disabled={working || !online || (role.memberCount ?? 0) > 0} onClick={() => void removeRole(role)}>Remove</button>}
                </div>
              </article>
            ))}
          </section>
          <section className="panel form-panel">
            <h4>Add team member</h4>
            <form className="form-grid" onSubmit={createMember}>
              <label>Name<input value={memberDraft.name} onChange={(event) => setMemberDraft({ ...memberDraft, name: event.target.value })} maxLength={160} required /></label>
              <label>Email<input type="email" value={memberDraft.email} onChange={(event) => setMemberDraft({ ...memberDraft, email: event.target.value })} maxLength={254} required /></label>
              <label>Initial password<input type="password" value={memberDraft.initialPassword} onChange={(event) => setMemberDraft({ ...memberDraft, initialPassword: event.target.value })} minLength={16} maxLength={72} autoComplete="new-password" required /></label>
              <label>Role<select value={memberDraft.roleId} onChange={(event) => setMemberDraft({ ...memberDraft, roleId: event.target.value })} required>{roles.filter((role) => role.name !== 'Owner').map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <button className="button button-primary" disabled={working || !online || !memberDraft.roleId}>{working ? 'Creating…' : 'Create member'}</button>
            </form>
          </section>
          <section className="panel form-panel">
            <h4>Business team</h4>
            {members.length ? members.map((member) => (
              <article className="business-role-row" key={member.id}>
                <div><strong>{member.user.name}</strong><small className="table-note">{member.user.email} · {member.active ? 'Active' : 'Removed — no access'}</small></div>
                <div className="row-actions">
                  <select aria-label={`Role for ${member.user.name}`} value={member.role.id} disabled={working || !online || member.role.name === 'Owner'} onChange={(event) => void updateMember(member, { roleId: event.target.value })}>
                    {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                  {member.role.name !== 'Owner' && (member.active
                    ? <button className="button button-danger-quiet" type="button" disabled={working || !online} onClick={() => void removeMember(member)}>Remove from business</button>
                    : <button className="button button-secondary" type="button" disabled={working || !online} onClick={() => void updateMember(member, { active: true })}>Restore access</button>)}
                </div>
              </article>
            )) : <p className="muted">No team members have been added.</p>}
          </section>
        </>
      )}
    </section>
  );
}
