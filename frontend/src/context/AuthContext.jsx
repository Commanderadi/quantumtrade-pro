import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Auth, onUnauthorized } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous

    useEffect(() => {
        let cancelled = false;
        Auth.me()
            .then(({ user: u }) => {
                if (cancelled) return;
                setUser(u);
                setStatus('authenticated');
            })
            .catch(() => {
                if (cancelled) return;
                setUser(null);
                setStatus('anonymous');
            });
        // Any 401 from the API (expired or revoked session) signs the user out locally.
        onUnauthorized(() => {
            setUser(null);
            setStatus('anonymous');
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const login = useCallback(async (email, password) => {
        const { user: u } = await Auth.login(email, password);
        setUser(u);
        setStatus('authenticated');
    }, []);

    const register = useCallback(async (fields) => {
        const { user: u } = await Auth.register(fields);
        setUser(u);
        setStatus('authenticated');
    }, []);

    const logout = useCallback(async () => {
        await Auth.logout().catch(() => {});
        setUser(null);
        setStatus('anonymous');
    }, []);

    const value = useMemo(() => ({ user, status, login, register, logout, setUser }), [user, status, login, register, logout]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
