import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, type InfiniteData } from '@tanstack/react-query';
import type { ChatMessage } from 'shared';
import { useAuthStore } from '@/lib/store/auth-store';
import { useBillingStore } from '@/features/billing';
import { ApiError, listChatMessages, sendChatMessage, type ChatMessagesPage } from '@/lib/api';

/** Page size for `GET /v1/plants/:id/chat/messages` (mirrors `usePlantsList`'s convention). */
export const CHAT_MESSAGES_PAGE_SIZE = 20;

/** Poll cadence while an assistant reply is still pending — matches `useComparison`'s cadence. */
export const CHAT_POLL_INTERVAL_MS = 1500;

/** FR-012: at most 2 of the plant's photos may be attached as chat context. */
export const MAX_CONTEXT_PHOTOS = 2;

/**
 * Gives up polling for the assistant's reply after this many attempts
 * (~30s at `CHAT_POLL_INTERVAL_MS`) rather than polling forever — surfaces
 * `replyTimedOut` (a manual "check again" affordance) instead.
 */
const MAX_POLL_ATTEMPTS = 20;

type ChatMessagesQueryKey = readonly ['chat-messages', string, string | null];

interface PendingSend {
  /** Client-only id for the optimistic bubble — never sent to the server, and dropped once the real (persisted) messages catch up. */
  tempId: string;
  content: string;
  contextPhotoIds: string[];
  createdAt: string;
  /** Message count *before* this send; the reply is "arrived" once the fetched count reaches this + 2 (the user's own message + the assistant's, both persisted). */
  baselineCount: number;
}

export interface FailedSend {
  content: string;
  contextPhotoIds: string[];
  error: ApiError;
}

export interface UseChatResult {
  /** Persisted history, oldest → newest (does not include the optimistic in-flight message — see `optimisticMessage`). */
  messages: ChatMessage[];
  isLoadingHistory: boolean;
  historyError: ApiError | null;
  refetchHistory: () => void;
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  loadOlderMessages: () => void;
  /** The just-submitted user message, rendered immediately while the send request (and then the assistant's reply) are still in flight. */
  optimisticMessage: ChatMessage | null;
  isSending: boolean;
  /** True while waiting for the assistant's reply to appear in the persisted history after a successful send. */
  isAwaitingReply: boolean;
  /** True once polling for the reply has given up (`MAX_POLL_ATTEMPTS` reached) without it ever appearing. */
  replyTimedOut: boolean;
  /** Manually re-checks for the reply once (used after `replyTimedOut`). */
  checkForReply: () => void;
  send: (content: string, contextPhotoIds: string[]) => void;
  /** Present only when the send itself failed with something other than the FR-013 402 (that case opens the upgrade modal instead — see the domain rule in T-111's task file). */
  failedSend: FailedSend | null;
  /** Resubmits `failedSend`'s original content, unchanged. */
  retryFailedSend: () => void;
  dismissFailedSend: () => void;
}

/**
 * Orchestrates the US6 plant-scoped chat flow: history (cursor-paginated,
 * "load older messages" going further back in time) + optimistic send + poll
 * for the assistant's reply, mirroring the sibling `comparison` feature's
 * `useComparison` submit→poll shape but combined with a paginated thread
 * instead of a single terminal job. A 402 (FR-013, Free-tier cap / out of
 * credit) on send never becomes a `failedSend` error — it opens the shared
 * billing upgrade modal instead, per this task's domain rule.
 */
export function useChat(plantId: string): UseChatResult {
  const accessToken = useAuthStore((state) => state.accessToken);
  const openUpgradeModal = useBillingStore((state) => state.openUpgradeModal);

  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [replyTimedOut, setReplyTimedOut] = useState(false);
  const [failedSend, setFailedSend] = useState<FailedSend | null>(null);
  const pollAttemptsRef = useRef(0);

  const messagesQuery = useInfiniteQuery<
    ChatMessagesPage,
    ApiError,
    InfiniteData<ChatMessagesPage>,
    ChatMessagesQueryKey,
    string | undefined
  >({
    queryKey: ['chat-messages', plantId, accessToken],
    queryFn: ({ pageParam }) => {
      if (!accessToken) {
        return Promise.reject(new ApiError(0, null));
      }

      return listChatMessages(accessToken, plantId, {
        cursor: pageParam,
        limit: CHAT_MESSAGES_PAGE_SIZE,
      });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: accessToken !== null,
    refetchInterval: () => (pendingSend && !replyTimedOut ? CHAT_POLL_INTERVAL_MS : false),
  });

  const messages = useMemo(() => {
    const pages = messagesQuery.data?.pages ?? [];
    // `pages[0]` is the most recent window (see `listChatMessages`'s contract
    // note); each subsequent page (fetched via `loadOlderMessages`) is further
    // back in time, so the outer page order is reversed before flattening —
    // the rendered list then reads oldest → newest, top → bottom.
    return [...pages].reverse().flatMap((page) => page.data);
  }, [messagesQuery.data]);

  // Detects the assistant's reply landing in the persisted history. Runs only
  // when a fetch actually resolves with new data (`dataUpdatedAt` changes),
  // not on every render.
  useEffect(() => {
    if (!pendingSend) {
      return;
    }

    if (messages.length >= pendingSend.baselineCount + 2) {
      setPendingSend(null);
      setReplyTimedOut(false);
      pollAttemptsRef.current = 0;
      return;
    }

    pollAttemptsRef.current += 1;
    if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
      setReplyTimedOut(true);
    }
  }, [messagesQuery.dataUpdatedAt]);

  const sendMutation = useMutation<void, ApiError, PendingSend>({
    mutationFn: async (pending) => {
      if (!accessToken) {
        throw new ApiError(0, null);
      }

      await sendChatMessage(accessToken, plantId, {
        content: pending.content,
        contextPhotoIds: pending.contextPhotoIds,
      });
    },
    onSuccess: () => {
      // Kicks an immediate refetch so the persisted user message (and,
      // once ready, the assistant's reply) surface as soon as possible
      // instead of waiting a full poll interval.
      messagesQuery.refetch();
    },
    onError: (error, pending) => {
      setPendingSend(null);
      setReplyTimedOut(false);
      pollAttemptsRef.current = 0;

      if (error.status === 402) {
        // FR-013: Free-tier cap reached / out of credit — open the upgrade
        // modal instead of showing an error message (this task's domain rule).
        openUpgradeModal();
        return;
      }

      setFailedSend({ content: pending.content, contextPhotoIds: pending.contextPhotoIds, error });
    },
  });

  const send = useCallback(
    (content: string, contextPhotoIds: string[]) => {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const pending: PendingSend = {
        tempId: `optimistic-${Date.now()}`,
        content: trimmed,
        contextPhotoIds: contextPhotoIds.slice(0, MAX_CONTEXT_PHOTOS),
        createdAt: new Date().toISOString(),
        baselineCount: messages.length,
      };

      setFailedSend(null);
      setReplyTimedOut(false);
      pollAttemptsRef.current = 0;
      setPendingSend(pending);
      sendMutation.mutate(pending);
    },
    [messages.length, sendMutation],
  );

  const retryFailedSend = useCallback(() => {
    if (!failedSend) {
      return;
    }

    send(failedSend.content, failedSend.contextPhotoIds);
  }, [failedSend, send]);

  const dismissFailedSend = useCallback(() => setFailedSend(null), []);

  const checkForReply = useCallback(() => {
    pollAttemptsRef.current = 0;
    setReplyTimedOut(false);
    messagesQuery.refetch();
  }, [messagesQuery]);

  const loadOlderMessages = useCallback(() => {
    messagesQuery.fetchNextPage();
  }, [messagesQuery]);

  const optimisticMessage: ChatMessage | null = pendingSend
    ? {
        id: pendingSend.tempId,
        role: 'user',
        content: pendingSend.content,
        contextPhotoIds: pendingSend.contextPhotoIds,
        createdAt: pendingSend.createdAt,
      }
    : null;

  return {
    messages,
    isLoadingHistory: messagesQuery.isLoading,
    historyError: messagesQuery.isError ? messagesQuery.error : null,
    refetchHistory: () => messagesQuery.refetch(),
    hasOlderMessages: messagesQuery.hasNextPage ?? false,
    isLoadingOlderMessages: messagesQuery.isFetchingNextPage,
    loadOlderMessages,
    optimisticMessage,
    isSending: sendMutation.isPending,
    isAwaitingReply: pendingSend !== null && !replyTimedOut,
    replyTimedOut,
    checkForReply,
    send,
    failedSend,
    retryFailedSend,
    dismissFailedSend,
  };
}
