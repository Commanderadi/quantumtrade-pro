import { Component } from 'react';

export default class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('Unhandled UI error', error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="fatal">
                    <h1>Something went wrong</h1>
                    <p>An unexpected error occurred. Reloading the page usually fixes it.</p>
                    <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
