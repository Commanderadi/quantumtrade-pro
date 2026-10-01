import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { ErrorMessage } from '../components/ui';

export default function AuthPage({ mode }) {
    const isLogin = mode === 'login';
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [fields, setFields] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const update = (e) => setFields((f) => ({ ...f, [e.target.name]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            if (isLogin) await login(fields.email, fields.password);
            else await register(fields);
            navigate(location.state?.from?.pathname || '/', { replace: true });
        } catch (err) {
            setError(err);
            setBusy(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="brand brand-center">
                    <img src="/favicon.svg" alt="" width="36" height="36" />
                    <span>QuantumTrade Pro</span>
                </div>
                <h1>{isLogin ? 'Sign in' : 'Create your account'}</h1>
                <p className="muted">{isLogin ? 'Track your portfolio, watchlist and alerts.' : 'Free to use. Bring your own market data API keys.'}</p>
                <form onSubmit={submit} className="form" noValidate={false}>
                    {!isLogin && (
                        <label>
                            Username
                            <input name="username" value={fields.username} onChange={update} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" autoComplete="username" title="3–30 letters, digits or underscores" />
                        </label>
                    )}
                    <label>
                        Email
                        <input name="email" type="email" value={fields.email} onChange={update} required autoComplete="email" />
                    </label>
                    <label>
                        Password
                        <input name="password" type="password" value={fields.password} onChange={update} required minLength={isLogin ? 1 : 8} maxLength={128} autoComplete={isLogin ? 'current-password' : 'new-password'} />
                        {!isLogin && <span className="hint">At least 8 characters.</span>}
                    </label>
                    <ErrorMessage error={error} />
                    <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                        {busy ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
                    </button>
                </form>
                <p className="auth-switch">
                    {isLogin ? (
                        <>New here? <Link to="/register">Create an account</Link></>
                    ) : (
                        <>Already have an account? <Link to="/login">Sign in</Link></>
                    )}
                </p>
            </div>
        </div>
    );
}
