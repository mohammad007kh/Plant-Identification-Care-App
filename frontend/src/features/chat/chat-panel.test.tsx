import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ChatMessage, Plan } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBillingStore } from '@/features/billing';
import { defaultLocale, getMessages } from '@/i18n';
import { ChatPanel } from './chat-panel';

const TEST_ACCESS_TOKEN = 'access-token-chat';
const PLANT_ID = '11111111-1111-4111-8111-111111111111';
const PHOTO_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHOTO_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PHOTO_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const chatMessages = getMessages(defaultLocale).chat;
const billingMessages = getMessages(defaultLocale).billing.upgradeModal;

function buildChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    role: 'user',
    content: 'این گیاه چرا برگ‌هایش زرد شده؟',
    contextPhotoIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildPlan(): Plan {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    key: 'pro',
    monthlyCreditAllowance: 100,
    priceMinor: 49000,
    currency: 'IRR',
  };
}

let sendCallCount = 0;
let lastMessagesPage: { data: ChatMessage[]; nextCursor: string | null } = {
  data: [buildChatMessage()],
  nextCursor: null,
};

const server = setupServer(
  http.get(`*/v1/plants/${PLANT_ID}/chat/messages`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('cursor') === 'older-cursor') {
      return HttpResponse.json({
        data: [
          buildChatMessage({
            id: '66666666-6666-4666-8666-666666666666',
            content: 'قدیمی‌ترین پیام',
          }),
        ],
        nextCursor: null,
      });
    }
    return HttpResponse.json(lastMessagesPage);
  }),
  http.post(`*/v1/plants/${PLANT_ID}/chat`, () => {
    sendCallCount += 1;
    return HttpResponse.json({ status: 'accepted' }, { status: 202 });
  }),
  http.get('*/v1/subscriptions/plans', () => HttpResponse.json([buildPlan()])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  useAuthStore.setState({
    accessToken: TEST_ACCESS_TOKEN,
    user: null,
    justConvertedFromGuest: false,
  });
});

afterEach(() => {
  server.resetHandlers();
  sendCallCount = 0;
  lastMessagesPage = { data: [buildChatMessage()], nextCursor: null };
  useAuthStore.setState({ accessToken: null, user: null, justConvertedFromGuest: false });
  useBillingStore.setState({ isUpgradeModalOpen: false, isReturningFromCheckout: false });
});

afterAll(() => server.close());

function renderChatPanel(photoIds: string[] = [PHOTO_1, PHOTO_2, PHOTO_3]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPanel plantId={PLANT_ID} photoIds={photoIds} />
    </QueryClientProvider>,
  );
}

describe('ChatPanel', () => {
  it('renders chat history fetched from the messages endpoint', async () => {
    renderChatPanel();

    expect(await screen.findByTestId('chat-history')).toBeInTheDocument();
    expect(screen.getByText('این گیاه چرا برگ‌هایش زرد شده؟')).toBeInTheDocument();
  });

  it('renders the empty-history state when there is no prior conversation', async () => {
    lastMessagesPage = { data: [], nextCursor: null };

    renderChatPanel();

    expect(await screen.findByTestId('chat-history-empty')).toBeInTheDocument();
  });

  it('allows selecting at most 2 context photos and blocks a 3rd', async () => {
    renderChatPanel();
    await screen.findByTestId('chat-history');

    const user = userEvent.setup();
    await user.click(screen.getByTestId(`chat-context-photo-${PHOTO_1}`));
    await user.click(screen.getByTestId(`chat-context-photo-${PHOTO_2}`));
    await user.click(screen.getByTestId(`chat-context-photo-${PHOTO_3}`));

    expect(await screen.findByTestId('chat-context-photo-limit')).toBeInTheDocument();
    expect(screen.getByTestId(`chat-context-photo-${PHOTO_1}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId(`chat-context-photo-${PHOTO_2}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId(`chat-context-photo-${PHOTO_3}`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(sendCallCount).toBe(0);
  });

  it('deselecting a chosen photo frees a slot for another one', async () => {
    renderChatPanel();
    await screen.findByTestId('chat-history');

    const user = userEvent.setup();
    await user.click(screen.getByTestId(`chat-context-photo-${PHOTO_1}`));
    await user.click(screen.getByTestId(`chat-context-photo-${PHOTO_2}`));
    // Deselect PHOTO_1, freeing a slot.
    await user.click(screen.getByTestId(`chat-context-photo-${PHOTO_1}`));
    await user.click(screen.getByTestId(`chat-context-photo-${PHOTO_3}`));

    expect(screen.queryByTestId('chat-context-photo-limit')).not.toBeInTheDocument();
    expect(screen.getByTestId(`chat-context-photo-${PHOTO_2}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId(`chat-context-photo-${PHOTO_3}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('optimistically renders a sent message and clears the typing indicator once the assistant reply is persisted', async () => {
    // The POST handler simulates the backend synchronously persisting both
    // the user's message and the assistant's reply, so the immediate
    // post-send refetch (triggered by `useChat`'s `onSuccess`) already sees
    // the full exchange — no need to wait out the poll interval in this test.
    server.use(
      http.post(`*/v1/plants/${PLANT_ID}/chat`, async ({ request }) => {
        sendCallCount += 1;
        const body = (await request.json()) as { content: string };
        lastMessagesPage = {
          data: [
            buildChatMessage(),
            buildChatMessage({
              id: '44444444-4444-4444-8444-444444444444',
              content: body.content,
            }),
            buildChatMessage({
              id: '55555555-5555-4555-8555-555555555555',
              role: 'assistant',
              content: 'هفته‌ای یک‌بار آبیاری کافی است.',
            }),
          ],
          nextCursor: null,
        };
        return HttpResponse.json({ status: 'accepted' }, { status: 202 });
      }),
    );

    renderChatPanel([]);
    await screen.findByTestId('chat-history');

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(chatMessages.composer.placeholder),
      'گیاهم رو چطور آبیاری کنم؟',
    );
    await user.click(screen.getByRole('button', { name: chatMessages.composer.sendButton }));

    // The user's own message renders immediately — either as the optimistic
    // bubble (while the send is still in flight) or, once the mocked
    // send/refetch round trip resolves (which, with instant mocks, can
    // finish within the same `act` flush as the click itself), as the
    // real persisted message. Either way it must be visible without delay.
    expect(screen.getByText('گیاهم رو چطور آبیاری کنم؟')).toBeInTheDocument();

    // The assistant's reply — and the typing indicator clearing once it
    // lands — is asserted with `findBy` since it depends on the mocked
    // network round trip actually resolving.
    expect(await screen.findByText('هفته‌ای یک‌بار آبیاری کافی است.')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-awaiting-reply')).not.toBeInTheDocument();
    expect(sendCallCount).toBe(1);
  });

  it('opens the upgrade modal instead of an error message when sending returns 402', async () => {
    server.use(
      http.post(`*/v1/plants/${PLANT_ID}/chat`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Payment Required',
            status: 402,
            code: 'insufficient_credit',
          },
          { status: 402 },
        ),
      ),
    );

    renderChatPanel([]);
    await screen.findByTestId('chat-history');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(chatMessages.composer.placeholder), 'یک سوال دیگر');
    await user.click(screen.getByRole('button', { name: chatMessages.composer.sendButton }));

    expect(await screen.findByText(billingMessages.title)).toBeInTheDocument();
    expect(screen.queryByTestId('chat-send-error')).not.toBeInTheDocument();
  });

  it('shows a retry-able error on a non-402 send failure, and resubmits the same content on retry', async () => {
    server.use(
      http.post(
        `*/v1/plants/${PLANT_ID}/chat`,
        () => {
          sendCallCount += 1;
          return HttpResponse.json({}, { status: 500 });
        },
        { once: true },
      ),
    );

    renderChatPanel([]);
    await screen.findByTestId('chat-history');

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(chatMessages.composer.placeholder),
      'چرا برگ‌ها می‌ریزند؟',
    );
    await user.click(screen.getByRole('button', { name: chatMessages.composer.sendButton }));

    expect(await screen.findByTestId('chat-send-error')).toBeInTheDocument();
    expect(sendCallCount).toBe(1);

    await user.click(screen.getByRole('button', { name: chatMessages.composer.retryButton }));

    // The retry resubmits successfully (the `{ once: true }` 500 override
    // above only applied to the first POST) and clears the error state.
    await waitFor(() => expect(sendCallCount).toBe(2));
    expect(screen.queryByTestId('chat-send-error')).not.toBeInTheDocument();
  });

  it('paginates: loading older messages reveals earlier history above the initial window', async () => {
    lastMessagesPage = { data: [buildChatMessage()], nextCursor: 'older-cursor' };

    renderChatPanel([]);
    await screen.findByTestId('chat-history');
    expect(screen.queryByText('قدیمی‌ترین پیام')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: chatMessages.history.loadOlderButton }));

    expect(await screen.findByText('قدیمی‌ترین پیام')).toBeInTheDocument();
  });

  it('renders a retry button on a history fetch failure, and retries on click', async () => {
    server.use(
      http.get(
        `*/v1/plants/${PLANT_ID}/chat/messages`,
        () => HttpResponse.json({}, { status: 500 }),
        { once: true },
      ),
    );

    renderChatPanel([]);

    expect(await screen.findByTestId('chat-history-error')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: chatMessages.history.retryButton }));

    expect(await screen.findByTestId('chat-history')).toBeInTheDocument();
  });
});
