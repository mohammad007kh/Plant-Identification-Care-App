import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { OfflineBanner } from './offline-banner';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

afterEach(() => {
  cleanup();
  setOnline(true);
});

describe('OfflineBanner (T-161, FR-030)', () => {
  it('renders nothing when the browser is online', () => {
    setOnline(true);
    render(<OfflineBanner />);

    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });

  it('shows the Persian offline message immediately when navigator.onLine is already false on mount', () => {
    setOnline(false);
    render(<OfflineBanner />);

    const banner = screen.getByTestId('offline-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('اتصال اینترنت شما قطع است');
  });

  it('shows the banner on an "offline" event and hides it again on "online"', () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });
});
