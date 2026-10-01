import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fn(signal)` when `deps` change and tracks loading/error/data.
 * Stale responses are discarded via AbortController.
 */
export function useAsync(fn, deps = [], { enabled = true } = {}) {
    const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
    const [tick, setTick] = useState(0);
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
        if (!enabled) {
            setState((s) => ({ ...s, loading: false }));
            return undefined;
        }
        const controller = new AbortController();
        setState((s) => ({ ...s, loading: true, error: null }));
        fnRef.current(controller.signal).then(
            (data) => !controller.signal.aborted && setState({ data, error: null, loading: false }),
            (error) => {
                if (controller.signal.aborted || error.name === 'AbortError') return;
                setState((s) => ({ ...s, error, loading: false }));
            }
        );
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, tick, enabled]);

    const reload = useCallback(() => setTick((t) => t + 1), []);
    const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
    return { ...state, reload, setData };
}

/** Calls `callback` every `ms` while the tab is visible. */
export function useInterval(callback, ms) {
    const ref = useRef(callback);
    ref.current = callback;
    useEffect(() => {
        if (!ms) return undefined;
        const id = setInterval(() => {
            if (document.visibilityState === 'visible') ref.current();
        }, ms);
        return () => clearInterval(id);
    }, [ms]);
}
