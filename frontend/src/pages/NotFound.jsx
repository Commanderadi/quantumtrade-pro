import { Link } from 'react-router';

export default function NotFound() {
    return (
        <div className="page">
            <h1>Page not found</h1>
            <p className="muted">The page you are looking for doesn’t exist.</p>
            <Link to="/" className="btn btn-primary">Back to dashboard</Link>
        </div>
    );
}
