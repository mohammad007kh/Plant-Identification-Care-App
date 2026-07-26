import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppErrorBoundary } from './error-boundary';

afterEach(() => cleanup());

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom');
  return <div data-testid="safe-child">ok</div>;
}

describe('AppErrorBoundary (T-161, FR-030)', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <Bomb shouldThrow={false} />
      </AppErrorBoundary>,
    );

    expect(screen.getByTestId('safe-child')).toBeInTheDocument();
    expect(screen.queryByTestId('app-error-boundary')).not.toBeInTheDocument();
  });

  it('renders a Persian fallback + retry button instead of a blank screen when a child throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <Bomb shouldThrow={true} />
      </AppErrorBoundary>,
    );

    const boundary = screen.getByTestId('app-error-boundary');
    expect(boundary).toBeInTheDocument();
    expect(boundary).toHaveTextContent('مشکلی پیش آمد');
    // Reassures the user credit safety (FR-017 tie-in) instead of a bare error.
    expect(boundary).toHaveTextContent('بازگردانده شده است');
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('retry clears the error state so a subsequently-fixed subtree renders again', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <AppErrorBoundary>
        <Bomb shouldThrow={true} />
      </AppErrorBoundary>,
    );
    expect(screen.getByTestId('app-error-boundary')).toBeInTheDocument();

    // The underlying condition is fixed (e.g. a refetch succeeded) before the
    // user retries — mirrors how a real crash-causing state gets resolved.
    rerender(
      <AppErrorBoundary>
        <Bomb shouldThrow={false} />
      </AppErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    expect(screen.getByTestId('safe-child')).toBeInTheDocument();
    expect(screen.queryByTestId('app-error-boundary')).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
