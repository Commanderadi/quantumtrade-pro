import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';

// Chart-heavy pages are split into separate chunks.
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const Markets = lazy(() => import('./pages/Markets'));
const Analysis = lazy(() => import('./pages/Analysis'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children }) {
    const { status } = useAuth();
    const location = useLocation();
    if (status === 'loading') return <div className="center-screen"><Spinner /></div>;
    if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
    return children;
}

function GuestOnly({ children }) {
    const { status } = useAuth();
    if (status === 'loading') return <div className="center-screen"><Spinner /></div>;
    if (status === 'authenticated') return <Navigate to="/" replace />;
    return children;
}

export function AppRoutes() {
    return (
        <Suspense fallback={<Spinner />}>
            <Routes>
                <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
                <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
                <Route element={<RequireAuth><Layout /></RequireAuth>}>
                    <Route index element={<Dashboard />} />
                    <Route path="portfolio" element={<PortfolioPage />} />
                    <Route path="markets" element={<Markets />} />
                    <Route path="analysis" element={<Analysis />} />
                    <Route path="analysis/:assetType/:symbol" element={<Analysis />} />
                    <Route path="alerts" element={<AlertsPage />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <ThemeProvider>
                <AuthProvider>
                    <BrowserRouter>
                        <AppRoutes />
                    </BrowserRouter>
                </AuthProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}
