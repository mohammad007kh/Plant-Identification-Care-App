import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAuthStore, type AuthStatus } from '@/lib/store/auth-store';
import ProtectedLayout from './layout';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function setAuthStatus(authStatus: AuthStatus): void {
  useAuthStore.setState({
    accessToken: authStatus === 'authenticated' ? 'a-token' : null,
    user: null,
    justConvertedFromGuest: false,
    authStatus,
  });
}

beforeEach(() => {
  replaceMock.mockClear();
});

afterEach(() => {
  setAuthStatus('unknown');
});

describe('ProtectedLayout', () => {
  it('renders the loading state without redirecting while authStatus is unknown', () => {
    setAuthStatus('unknown');

    render(
      <ProtectedLayout>
        <div>protected content</div>
      </ProtectedLayout>,
    );

    expect(screen.getByTestId('protected-layout-loading')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects to /login when authStatus is guest', () => {
    setAuthStatus('guest');

    render(
      <ProtectedLayout>
        <div>protected content</div>
      </ProtectedLayout>,
    );

    expect(replaceMock).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders children when authStatus is authenticated', () => {
    setAuthStatus('authenticated');

    render(
      <ProtectedLayout>
        <div>protected content</div>
      </ProtectedLayout>,
    );

    expect(screen.getByText('protected content')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
