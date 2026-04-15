import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchApiJson, toApiUrl } from './api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toApiUrl', () => {
  it('returns relative path when VITE_API_URL is not set', () => {
    expect(toApiUrl('/api/health')).toBe('/api/health');
  });
});

describe('fetchApiJson', () => {
  it('returns parsed payload when response is ok', async () => {
    const mockJson = vi.fn().mockResolvedValue({ data: [{ id: 1 }] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: mockJson,
      })
    );

    const result = await fetchApiJson<{ data: Array<{ id: number }> }>('/api/demo');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(1);
  });

  it('throws detail message when api returns error payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ detail: 'Custom API error' }),
      })
    );

    await expect(fetchApiJson('/api/demo')).rejects.toThrow('Custom API error');
  });
});
