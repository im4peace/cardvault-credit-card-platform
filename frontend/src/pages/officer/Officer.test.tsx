import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { AuthProvider } from '../../auth/AuthContext';

type Handler = (body: unknown) => unknown;
const calls: { method: string; path: string; body: unknown }[] = [];

const application = (over: Record<string, unknown> = {}) => ({
  id: 'app1',
  customerId: 'c1',
  status: 'PENDING_CREDIT_REVIEW',
  firstName: 'Bob',
  lastName: 'Brown',
  email: 'bob@test.com',
  phone: '+1-555-0100',
  dateOfBirth: '1990-01-01T00:00:00Z',
  address: '1 Main St',
  city: 'Town',
  country: 'USA',
  employmentStatus: 'EMPLOYED',
  employerName: 'Acme',
  monthlyIncome: 7000,
  requestedCreditLimit: 8000,
  submittedAt: '2026-01-02T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  decision: null,
  ...over,
});

const limitRequest = (over: Record<string, unknown> = {}) => ({
  id: 'lr1',
  cardId: 'card1',
  type: 'CREDIT_LIMIT_INCREASE',
  currentLimit: 5000,
  requestedLimit: 8000,
  reason: 'Travel',
  status: 'PENDING',
  createdAt: '2026-01-03T00:00:00Z',
  decision: null,
  card: { id: 'card1', availableLimit: 4200, creditLimit: 5000, status: 'ACTIVE' },
  ...over,
});

/** Routes fetch calls by "METHOD path" (query string ignored unless registered with it). */
function mockApi(routes: Record<string, Handler>) {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });
      const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
      if (!handler) return { ok: false, status: 404, json: async () => ({ error: `no mock for ${method} ${path}` }) };
      return { ok: true, status: 200, json: async () => handler(body) };
    }),
  );
}

const officerUser = { id: 'o1', email: 'officer@test.com', role: 'CREDIT_OFFICER' };
const customerUser = { id: 'c1', email: 'customer@test.com', role: 'CUSTOMER' };

function renderAt(path: string, user: typeof officerUser | typeof customerUser | null, routes: Record<string, Handler> = {}) {
  if (user) localStorage.setItem('ccm.token', 'tok');
  mockApi({ 'GET /auth/me': () => user, ...routes });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const lastCall = (method: string, pathPart: string) =>
  [...calls].reverse().find((c) => c.method === method && c.path.includes(pathPart));

describe('Credit Officer portal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('officer logs in and lands on the Credit Team dashboard', async () => {
    mockApi({
      'POST /auth/login': () => ({ token: 'tok', user: officerUser }),
      'GET /officer/applications': () => [application()],
      'GET /officer/limit-requests': () => [limitRequest()],
      'GET /officer/history': () => ({ applications: [], limitRequests: [] }),
    });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('Email'), 'officer@test.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Officer123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Credit Team Portal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Credit Team dashboard' })).toBeInTheDocument();
    expect(await screen.findAllByText('1')).not.toHaveLength(0);
  });

  it('lists pending applications with a link to review', async () => {
    renderAt('/officer/applications', officerUser, {
      'GET /officer/applications': () => [application(), application({ id: 'app2', firstName: 'Carol', lastName: 'Clark' })],
    });
    expect(await screen.findByText('Bob Brown')).toBeInTheDocument();
    expect(screen.getByText('Carol Clark')).toBeInTheDocument();
    expect(lastCall('GET', '/officer/applications')?.path).toContain('status=PENDING_CREDIT_REVIEW');
    expect(screen.getAllByRole('link', { name: 'Review' })).toHaveLength(2);
  });

  it('shows applicant details on the review page', async () => {
    renderAt('/officer/applications/app1', officerUser, { 'GET /officer/applications/app1': () => application() });
    expect(await screen.findByText('Bob Brown')).toBeInTheDocument();
    expect(screen.getByText('bob@test.com')).toBeInTheDocument();
    expect(screen.getByText('$7,000')).toBeInTheDocument();
    expect(screen.getByText(/EMPLOYED · Acme/)).toBeInTheDocument();
  });

  it('approves an application with the chosen limit and comment', async () => {
    renderAt('/officer/applications/app1', officerUser, {
      'GET /officer/applications/app1': () => application(),
      'POST /officer/applications/app1/decision': () => application({ status: 'CARD_ISSUED' }),
      'GET /officer/applications': () => [],
    });
    const limit = await screen.findByLabelText('Approved credit limit (USD)');
    await userEvent.clear(limit);
    await userEvent.type(limit, '6500');
    await userEvent.type(screen.getByLabelText(/Decision comment/), 'Good history');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(lastCall('POST', '/decision')).toBeDefined());
    expect(lastCall('POST', '/officer/applications/app1/decision')?.body).toEqual({
      decision: 'APPROVED',
      approvedLimit: 6500,
      comment: 'Good history',
    });
    expect(await screen.findByRole('heading', { name: 'Pending applications' })).toBeInTheDocument();
  });

  it('rejecting requires a comment, then posts REJECTED', async () => {
    renderAt('/officer/applications/app1', officerUser, {
      'GET /officer/applications/app1': () => application(),
      'POST /officer/applications/app1/decision': () => application({ status: 'REJECTED' }),
      'GET /officer/applications': () => [],
    });
    const reject = await screen.findByRole('button', { name: 'Reject' });
    expect(reject).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Decision comment/), 'Income too low');
    expect(reject).toBeEnabled();
    await userEvent.click(reject);
    await waitFor(() =>
      expect(lastCall('POST', '/officer/applications/app1/decision')?.body).toEqual({
        decision: 'REJECTED',
        comment: 'Income too low',
      }),
    );
  });

  it('shows the API error when a decision fails (already processed)', async () => {
    renderAt('/officer/applications/app1', officerUser, {
      'GET /officer/applications/app1': () => application(),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('lists pending limit requests (increase and decrease)', async () => {
    renderAt('/officer/limits', officerUser, {
      'GET /officer/limit-requests': () => [
        limitRequest(),
        limitRequest({ id: 'lr2', type: 'CREDIT_LIMIT_DECREASE', requestedLimit: 2000 }),
      ],
    });
    expect(await screen.findByText('Increase')).toBeInTheDocument();
    expect(screen.getByText('Decrease')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Review' })).toHaveLength(2);
  });

  it('approves a limit INCREASE', async () => {
    renderAt('/officer/limits/lr1', officerUser, {
      'GET /officer/limit-requests': () => [limitRequest()],
      'POST /officer/limit-requests/lr1/decision': () => limitRequest({ status: 'APPROVED' }),
    });
    expect(await screen.findByText('Customer reason: “Travel”')).toBeInTheDocument();
    expect(screen.getByText('$8,000')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Decision comment'), 'ok');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(lastCall('POST', '/officer/limit-requests/lr1/decision')?.body).toEqual({
        decision: 'APPROVED',
        comment: 'ok',
      }),
    );
  });

  it('approves a limit DECREASE', async () => {
    const decrease = limitRequest({ id: 'lr2', type: 'CREDIT_LIMIT_DECREASE', requestedLimit: 2000 });
    renderAt('/officer/limits/lr2', officerUser, {
      'GET /officer/limit-requests': () => [decrease],
      'POST /officer/limit-requests/lr2/decision': () => ({ ...decrease, status: 'APPROVED' }),
    });
    expect(await screen.findByRole('heading', { name: 'Decrease' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(lastCall('POST', '/officer/limit-requests/lr2/decision')?.body).toMatchObject({ decision: 'APPROVED' }),
    );
  });

  it('rejects a limit request with a comment', async () => {
    renderAt('/officer/limits/lr1', officerUser, {
      'GET /officer/limit-requests': () => [limitRequest()],
      'POST /officer/limit-requests/lr1/decision': () => limitRequest({ status: 'REJECTED' }),
    });
    await userEvent.type(await screen.findByLabelText('Decision comment'), 'Not now');
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(lastCall('POST', '/officer/limit-requests/lr1/decision')?.body).toEqual({
        decision: 'REJECTED',
        comment: 'Not now',
      }),
    );
  });

  it('shows processed applications and limit requests in decision history', async () => {
    renderAt('/officer/history', officerUser, {
      'GET /officer/history': () => ({
        applications: [
          application({
            status: 'REJECTED',
            decision: { decision: 'REJECTED', comment: 'Income too low', decidedAt: '2026-01-05T00:00:00Z' },
          }),
        ],
        limitRequests: [
          limitRequest({
            status: 'APPROVED',
            decision: { decision: 'APPROVED', comment: 'Fine', decidedAt: '2026-01-06T00:00:00Z' },
          }),
        ],
      }),
    });
    expect(await screen.findByText('“Income too low”')).toBeInTheDocument();
    expect(screen.getByText('“Fine”')).toBeInTheDocument();
    const apps = screen.getByRole('heading', { name: 'Applications' }).closest('section') as HTMLElement;
    expect(within(apps).getByText('REJECTED')).toBeInTheDocument();
  });
});

describe('role-based access in the UI', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it.each(['/officer', '/officer/applications', '/officer/applications/app1', '/officer/limits', '/officer/history'])(
    'CUSTOMER visiting %s is sent to the customer portal and no officer API is called',
    async (path) => {
      renderAt(path, customerUser, {
        'GET /applications': () => [],
        'GET /cards': () => [],
        'GET /limit-requests': () => [],
      });
      expect(await screen.findByText('Customer Portal')).toBeInTheDocument();
      expect(screen.queryByText('Credit Team Portal')).toBeNull();
      expect(calls.some((c) => c.path.startsWith('/officer'))).toBe(false);
    },
  );

  it('CREDIT_OFFICER visiting the customer portal is sent to the officer portal', async () => {
    renderAt('/customer/apply', officerUser, {
      'GET /officer/applications': () => [],
      'GET /officer/limit-requests': () => [],
      'GET /officer/history': () => ({ applications: [], limitRequests: [] }),
    });
    expect(await screen.findByText('Credit Team Portal')).toBeInTheDocument();
  });

  it('unauthenticated users are sent to login', async () => {
    renderAt('/officer', null);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('a stale token (API rejects /auth/me) ends up at login', async () => {
    localStorage.setItem('ccm.token', 'expired');
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) })),
    );
    render(
      <MemoryRouter initialEntries={['/officer']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(localStorage.getItem('ccm.token')).toBeNull();
  });
});

describe('session expiry', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('a 401 from any API call clears the token and returns the user to login', async () => {
    localStorage.setItem('ccm.token', 'tok');
    let calls401 = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth/me')) return { ok: true, status: 200, json: async () => customerUser };
        calls401 = true; // every later call: the token has expired server-side
        return { ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) };
      }),
    );
    render(
      <MemoryRouter initialEntries={['/customer']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(calls401).toBe(true);
    expect(localStorage.getItem('ccm.token')).toBeNull();
  });

  it('a failed login (401 without a token) does not trigger a sign-out event', async () => {
    const handler = vi.fn();
    window.addEventListener('ccm:unauthorized', handler);
    mockApi({});
    renderAt('/login', null);
    await userEvent.type(await screen.findByLabelText('Email'), 'a@test.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Invalid email or password' }) })));
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('ccm:unauthorized', handler);
  });
});
