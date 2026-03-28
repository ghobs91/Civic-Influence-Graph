import { describe, it, expect } from 'vitest';
import { buildServer } from '../server.js';

describe('API Server', () => {
  it('returns health check', async () => {
    const server = await buildServer();
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await server.close();
  });

  it('returns 404 for unknown routes', async () => {
    const server = await buildServer();
    const response = await server.inject({
      method: 'GET',
      url: '/nonexistent',
    });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.request_id).toBeTruthy();
    await server.close();
  });

  it('includes request_id in error responses', async () => {
    const server = await buildServer();
    const response = await server.inject({
      method: 'GET',
      url: '/nonexistent',
    });
    const body = response.json();
    // UUID format check
    expect(body.error.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    await server.close();
  });

  it('includes security headers in responses', async () => {
    const server = await buildServer();
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    await server.close();
  });
});
