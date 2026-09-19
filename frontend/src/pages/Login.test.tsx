import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';

function mockFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => ({
      ok: status < 400,
      status,
      json: async () => handler(url, init),
    })),
  );
}

function renderApp(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('shows an error on bad credentials', async () => {
    mockFetch(() => ({ error: 'Invalid email or password' }), 401);
    renderApp();
    await userEvent.type(screen.getByLabelText('Email'), 'a@test.com');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('routes a customer to the customer dashboard after login', async () => {
    mockFetch((url) => {
      if (url.endsWith('/auth/login')) return { token: 't', user: { id: '1', email: 'c@test.com', role: 'CUSTOMER' } };
      return [];
    });
    renderApp();
    await userEvent.type(screen.getByLabelText('Email'), 'c@test.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Customer123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Customer Portal')).toBeInTheDocument();
    expect(localStorage.getItem('ccm.token')).toBe('t');
  });

  it('redirects unauthenticated users away from protected routes', async () => {
    renderApp('/officer/applications');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument());
  });
});
