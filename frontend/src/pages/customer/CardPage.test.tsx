import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardPage } from './CardPage';

const card = (status: string) => ({
  id: 'abcdef123456',
  applicationId: 'a1',
  status,
  creditLimit: 5000,
  availableLimit: 5000,
  issuedAt: '2026-01-01T00:00:00Z',
  activatedAt: null,
});

describe('CardPage', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('offers activation only for ISSUED cards and calls the API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [card('ISSUED')] })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => card('ACTIVE') })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [card('ACTIVE')] });
    vi.stubGlobal('fetch', fetchMock);
    render(<CardPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Activate card' }));
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/cards\/abcdef123456\/activate$/);
    await screen.findByText('ACTIVE');
    expect(screen.queryByRole('button', { name: 'Activate card' })).toBeNull();
  });

  it('shows an empty state when there is no card', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
    render(<CardPage />);
    expect(await screen.findByText(/No card yet/)).toBeInTheDocument();
  });
});
