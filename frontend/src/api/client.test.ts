// T-WEB-02: the API client retries 503 and network errors with the same Idempotency-Key and never retries 4xx.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, retryDelay, timing } from './client';

const busy = () => new Response(JSON.stringify({ error: { code: 'busy', message: 'Server is busy', request_id: 'r' } }),
  { status: 503, headers: { 'Retry-After': '1' } });
const full = () => new Response(JSON.stringify({ error: { code: 'team_full', message: 'Team is full', request_id: 'r' } }), { status: 409 });
const ok = () => new Response(JSON.stringify({ id: 't1' }), { status: 200 });
const keyOf = (call: unknown[]) => ((call[1] as RequestInit).headers as Record<string, string>)['Idempotency-Key'];

describe('T-WEB-02 client retries', () => {
  beforeEach(() => {
    vi.spyOn(timing, 'sleep').mockResolvedValue(undefined);
    vi.spyOn(timing, 'jitter').mockReturnValue(0);
  });

  it('retries 503 with the same key, honoring Retry-After, then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('POST', '/api/teams/join', { code: 'X' })).resolves.toEqual({ id: 't1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const keys = fetchMock.mock.calls.map(keyOf);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[a-f0-9]{32}$/);
    expect(timing.sleep).toHaveBeenCalledWith(1000);
  });

  it('stops at the first 409 and surfaces its code', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(full());
    vi.stubGlobal('fetch', fetchMock);
    const error = await request('POST', '/api/teams/join', { code: 'X' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('team_full');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after 3 retries of 503', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => busy());
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('POST', '/api/teams/join', {})).rejects.toMatchObject({ status: 503, code: 'busy' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries network errors with the same key and reports network_error at the end', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('POST', '/api/teams/x/leave', undefined, { idempotencyKey: 'k'.repeat(16) }))
      .rejects.toMatchObject({ code: 'network_error' });
    expect(fetchMock.mock.calls.map(keyOf)).toEqual(Array(4).fill('k'.repeat(16)));
  });

  it('sends no key on signup, login and GET', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    await request('POST', '/api/auth/login', {}, { noIdempotency: true });
    await request('GET', '/api/auth/me');
    expect(fetchMock.mock.calls.map(keyOf)).toEqual([undefined, undefined]);
  });

  it('uses exponential delays without Retry-After', () => {
    vi.spyOn(timing, 'jitter').mockReturnValue(0);
    expect([1, 2, 3].map((n) => retryDelay(n, null))).toEqual([200, 400, 800]);
  });
});
