const API_BASE = (((import.meta as any).env?.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');

export const toApiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

export const fetchApiJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(toApiUrl(path), init);
	const payload = await response.json().catch(() => ({}));

	if (!response.ok) {
		const detail = typeof payload?.detail === 'string' ? payload.detail : `Request failed with status ${response.status}`;
		throw new Error(detail);
	}

	return payload as T;
};
