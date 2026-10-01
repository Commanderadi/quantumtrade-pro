import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Auth } from '../lib/api';
import { formatDate } from '../lib/format';
import { Card, ErrorMessage, Notice, Segmented } from '../components/ui';

export default function Settings() {
    const { user, setUser, logout } = useAuth();
    const { theme, toggle } = useTheme();

    return (
        <div className="page narrow">
            <div className="page-header">
                <h1>Settings</h1>
            </div>
            <Card title="Account">
                <dl className="details">
                    <dt>Username</dt><dd>{user.username}</dd>
                    <dt>Email</dt><dd>{user.email}</dd>
                    <dt>Member since</dt><dd>{formatDate(user.createdAt)}</dd>
                </dl>
            </Card>
            <Card title="Appearance">
                <Segmented label="Theme" value={theme} onChange={(t) => t !== theme && toggle()} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
            </Card>
            <ChangePassword onChanged={setUser} />
            <Sessions onDone={logout} />
            <DeleteAccount onDeleted={logout} />
        </div>
    );
}

function ChangePassword({ onChanged }) {
    const [fields, setFields] = useState({ currentPassword: '', newPassword: '', confirm: '' });
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const set = (e) => setFields((f) => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (fields.newPassword !== fields.confirm) return setStatus({ error: 'New passwords do not match.' });
        setBusy(true);
        setStatus(null);
        try {
            const { user } = await Auth.changePassword(fields.currentPassword, fields.newPassword);
            onChanged(user);
            setFields({ currentPassword: '', newPassword: '', confirm: '' });
            setStatus({ ok: 'Password changed. Other devices have been signed out.' });
        } catch (err) {
            setStatus({ error: err });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card title="Change password">
            <form className="form" onSubmit={submit}>
                <label>Current password<input type="password" name="currentPassword" value={fields.currentPassword} onChange={set} required autoComplete="current-password" /></label>
                <label>New password<input type="password" name="newPassword" value={fields.newPassword} onChange={set} required minLength={8} maxLength={128} autoComplete="new-password" /></label>
                <label>Confirm new password<input type="password" name="confirm" value={fields.confirm} onChange={set} required autoComplete="new-password" /></label>
                {status?.ok && <Notice tone="success">{status.ok}</Notice>}
                <ErrorMessage error={status?.error} />
                <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>Update password</button></div>
            </form>
        </Card>
    );
}

function Sessions({ onDone }) {
    const [error, setError] = useState(null);
    const signOutEverywhere = async () => {
        if (!window.confirm('Sign out of all devices, including this one?')) return;
        try {
            await Auth.logoutAll();
            onDone();
        } catch (err) {
            setError(err);
        }
    };
    return (
        <Card title="Sessions">
            <p className="muted">Lost a device or used a shared computer? Sign out everywhere to revoke every active session.</p>
            <ErrorMessage error={error} />
            <button type="button" className="btn" onClick={signOutEverywhere}>Sign out of all devices</button>
        </Card>
    );
}

function DeleteAccount({ onDeleted }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const submit = async (e) => {
        e.preventDefault();
        if (!window.confirm('This permanently deletes your account, portfolio, watchlist and alerts. Continue?')) return;
        try {
            await Auth.deleteAccount(password);
            onDeleted();
        } catch (err) {
            setError(err);
        }
    };
    return (
        <Card title="Delete account" className="danger-zone">
            <form className="form" onSubmit={submit}>
                <p className="muted">Permanently removes your account and all of its data. This cannot be undone.</p>
                <label>Confirm with your password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
                <ErrorMessage error={error} />
                <div className="form-actions"><button type="submit" className="btn btn-danger">Delete my account</button></div>
            </form>
        </Card>
    );
}
