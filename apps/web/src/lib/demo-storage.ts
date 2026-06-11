export function loadDemoState<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

export function saveDemoState(key: string, state: unknown): void {
    localStorage.setItem(key, JSON.stringify(state));
}

export function clearDemoState(key: string): void {
    localStorage.removeItem(key);
}
