'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * App-level React error boundary (T-161/FR-030, mounted once in the root
 * `(fa)` layout). Catches a render-time crash anywhere in the tree and shows
 * a clear Persian message + a "try again" action instead of a blank white
 * screen or a raw stack trace — the never-hang/never-blank-screen half of
 * FR-030's graceful-degradation requirement.
 *
 * Reassures the user that no credit was lost: by the time a component
 * renders at all, any AI/credit-metered call it depended on already settled
 * through `CreditsService.runMeteredAction` (completed or refunded,
 * T-015/FR-017) — this boundary is a pure UI safety net and never touches
 * credit itself, so the message is always true, not just reassuring copy.
 *
 * Class component: React error boundaries require `componentDidCatch` /
 * `getDerivedStateFromError`, which only exist on class components.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Last-resort visibility: no browser-side structured logger is wired up
    // yet, and losing the stack trace here would defeat the point of a
    // dedicated error boundary.
    console.error('AppErrorBoundary caught a render error', error, info);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const messages = getMessages(defaultLocale).errors.boundary;

    return (
      <Stack
        spacing={2}
        alignItems="center"
        role="alert"
        data-testid="app-error-boundary"
        sx={{ py: 6, px: 3, textAlign: 'center' }}
      >
        <Alert severity="error" sx={{ width: '100%', maxWidth: 480 }}>
          <Typography variant="subtitle1" component="p">
            {messages.title}
          </Typography>
          <Typography variant="body2" component="p">
            {messages.message}
          </Typography>
        </Alert>
        <Button type="button" variant="contained" onClick={this.handleRetry}>
          {messages.retryButton}
        </Button>
      </Stack>
    );
  }
}

export default AppErrorBoundary;
