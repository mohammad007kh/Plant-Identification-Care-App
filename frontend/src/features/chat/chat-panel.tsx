'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ChatMessage } from 'shared';
import { defaultLocale, getMessages } from '@/i18n';
// No barrel exists yet for the `chat` feature — a direct file import is used
// for the cross-feature `UpgradeModal`, matching how `photo-uploader.tsx`
// (sibling `scan` feature) reaches into `../../auth` today.
import { UpgradeModal } from '@/features/billing';
import { MAX_CONTEXT_PHOTOS, useChat, type UseChatResult } from './use-chat';

export interface ChatPanelProps {
  /** Opaque `public_id` of the plant this conversation is scoped to. */
  plantId: string;
  /** The plant's own photo ids, offered as selectable chat context (≤ `MAX_CONTEXT_PHOTOS`, FR-012). */
  photoIds?: string[];
}

type ChatMessages = ReturnType<typeof getMessages>['chat'];

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Renders a small positive integer with Persian-Arabic digits (e.g. `2` → `"۲"`), for the context-photo chip labels. */
function toPersianDigits(value: number): string {
  return String(value)
    .split('')
    .map((char) => PERSIAN_DIGITS[Number(char)] ?? char)
    .join('');
}

interface ChatBubbleProps {
  message: ChatMessage;
  messages: ChatMessages;
}

function ChatBubble({ message, messages }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <Stack
      data-testid={`chat-message-${message.id}`}
      spacing={0.5}
      sx={{ alignSelf: isUser ? 'flex-start' : 'flex-end', maxWidth: '80%' }}
    >
      <Typography variant="caption" color="text.secondary">
        {isUser ? messages.message.userLabel : messages.message.assistantLabel}
      </Typography>
      <Box
        sx={{
          bgcolor: isUser ? 'action.hover' : 'primary.main',
          color: isUser ? 'text.primary' : 'primary.contrastText',
          borderRadius: 2,
          px: 1.5,
          py: 1,
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {message.content}
        </Typography>
      </Box>
    </Stack>
  );
}

interface ChatHistoryProps {
  chat: UseChatResult;
  allMessages: ChatMessage[];
  messages: ChatMessages;
}

/**
 * Renders whichever of the history's states currently applies — loading,
 * error+retry, the thread itself (with a "load older messages" affordance
 * when more history exists), the typing indicator while an assistant reply
 * is pending, and a "still no reply" timeout state with a manual recheck.
 */
function ChatHistory({ chat, allMessages, messages }: ChatHistoryProps) {
  if (chat.isLoadingHistory) {
    return (
      <Stack
        spacing={1}
        alignItems="center"
        role="status"
        aria-live="polite"
        data-testid="chat-history-loading"
        sx={{ py: 3 }}
      >
        <CircularProgress aria-label={messages.history.loadingLabel} size={24} />
        <Typography variant="body2">{messages.history.loadingLabel}</Typography>
      </Stack>
    );
  }

  if (chat.historyError) {
    return (
      <Stack spacing={2} data-testid="chat-history-error">
        <Alert severity="error">{messages.history.errorMessage}</Alert>
        <Button
          type="button"
          variant="contained"
          onClick={chat.refetchHistory}
          sx={{ alignSelf: 'flex-start' }}
        >
          {messages.history.retryButton}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5} data-testid="chat-history">
      {chat.hasOlderMessages && (
        <Button
          type="button"
          variant="text"
          disabled={chat.isLoadingOlderMessages}
          onClick={chat.loadOlderMessages}
          sx={{ alignSelf: 'center' }}
        >
          {chat.isLoadingOlderMessages
            ? messages.history.loadingOlderButton
            : messages.history.loadOlderButton}
        </Button>
      )}

      {allMessages.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="chat-history-empty">
          {messages.history.emptyState}
        </Typography>
      ) : (
        allMessages.map((message) => (
          <ChatBubble key={message.id} message={message} messages={messages} />
        ))
      )}

      {chat.isAwaitingReply && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          role="status"
          aria-live="polite"
          data-testid="chat-awaiting-reply"
        >
          <CircularProgress size={16} aria-label={messages.reply.waitingLabel} />
          <Typography variant="body2" color="text.secondary">
            {messages.reply.waitingLabel}
          </Typography>
        </Stack>
      )}

      {chat.replyTimedOut && (
        <Stack spacing={1} data-testid="chat-reply-timeout">
          <Alert severity="info">{messages.reply.timeoutMessage}</Alert>
          <Button
            type="button"
            variant="outlined"
            onClick={chat.checkForReply}
            sx={{ alignSelf: 'flex-start' }}
          >
            {messages.reply.checkAgainButton}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

/**
 * US6 (FR-012/FR-013): plant-scoped AI chat thread — history + composer with
 * up to `MAX_CONTEXT_PHOTOS` selectable context photos, backed by `useChat`.
 * Mounts its own `UpgradeModal` instance (from the `billing` feature, which
 * already exports it) rather than a fallback CTA, since `useChat` drives that
 * exact modal's `isUpgradeModalOpen` store flag on a 402 (FR-013). No global
 * mount of `UpgradeModal` exists yet (that is `T-097`'s concern), so each
 * mounting feature — this one included — renders its own instance for now.
 */
export function ChatPanel({ plantId, photoIds = [] }: ChatPanelProps) {
  const messages = getMessages(defaultLocale).chat;
  const chat = useChat(plantId);

  const [content, setContent] = useState('');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [photoLimitWarning, setPhotoLimitWarning] = useState(false);

  const togglePhoto = (photoId: string) => {
    setSelectedPhotoIds((current) => {
      if (current.includes(photoId)) {
        setPhotoLimitWarning(false);
        return current.filter((id) => id !== photoId);
      }

      if (current.length >= MAX_CONTEXT_PHOTOS) {
        setPhotoLimitWarning(true);
        return current;
      }

      setPhotoLimitWarning(false);
      return [...current, photoId];
    });
  };

  const handleSend = () => {
    if (!content.trim()) {
      return;
    }

    chat.send(content, selectedPhotoIds);
    setContent('');
    setSelectedPhotoIds([]);
    setPhotoLimitWarning(false);
  };

  const allMessages = chat.optimisticMessage
    ? [...chat.messages, chat.optimisticMessage]
    : chat.messages;

  return (
    <Stack spacing={2} data-testid="chat-panel">
      <Typography variant="subtitle1" component="h3">
        {messages.panel.heading}
      </Typography>

      <ChatHistory chat={chat} allMessages={allMessages} messages={messages} />

      {photoIds.length > 0 && (
        <Stack spacing={1} data-testid="chat-context-photos">
          <Typography variant="caption" color="text.secondary">
            {messages.contextPhotos.heading}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {photoIds.map((photoId, index) => {
              const isSelected = selectedPhotoIds.includes(photoId);
              return (
                <Chip
                  key={photoId}
                  label={`${messages.contextPhotos.photoLabelPrefix} ${toPersianDigits(index + 1)}`}
                  color={isSelected ? 'primary' : 'default'}
                  variant={isSelected ? 'filled' : 'outlined'}
                  onClick={() => togglePhoto(photoId)}
                  data-testid={`chat-context-photo-${photoId}`}
                  aria-pressed={isSelected}
                />
              );
            })}
          </Stack>
          {photoLimitWarning && (
            <Alert severity="warning" data-testid="chat-context-photo-limit">
              {messages.contextPhotos.limitMessage}
            </Alert>
          )}
        </Stack>
      )}

      {chat.failedSend && (
        <Stack spacing={1} data-testid="chat-send-error">
          <Alert severity="error">{chat.failedSend.error.mapped.message}</Alert>
          <Button
            type="button"
            variant="outlined"
            onClick={chat.retryFailedSend}
            sx={{ alignSelf: 'flex-start' }}
          >
            {messages.composer.retryButton}
          </Button>
        </Stack>
      )}

      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          fullWidth
          multiline
          minRows={1}
          maxRows={4}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={messages.composer.placeholder}
          inputProps={{ 'aria-label': messages.composer.placeholder }}
        />
        <Button
          type="button"
          variant="contained"
          disabled={!content.trim() || chat.isSending}
          onClick={handleSend}
        >
          {chat.isSending ? messages.composer.sendingButton : messages.composer.sendButton}
        </Button>
      </Stack>

      <UpgradeModal />
    </Stack>
  );
}

export default ChatPanel;
