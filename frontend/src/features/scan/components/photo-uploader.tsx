'use client';

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { RegistrationWall } from '../../auth';

export interface PhotoUploaderProps {
  /** Called with the selected file only after it passes the image-type check. */
  onSubmit: (file: File) => void;
  /** Disables the submit button and swaps its label while a scan is being created. */
  isSubmitting: boolean;
  /** Server-side submission error (e.g. 415), already translated to Persian. */
  submitError?: string | null;
  /**
   * True when the last submission was rejected by the guest-limit 403
   * (T-021's server-authoritative guard). Renders the registration wall IN
   * PLACE OF the uploader/error UI — never alongside it — per FR-007/FR-008.
   */
  isGuestLimitExceeded?: boolean;
}

/**
 * "Visually hidden but still in the accessibility tree" pattern (not
 * `display: none`, which some assistive tech and interaction-simulation
 * tools treat as fully absent) for the two native file inputs — the visible
 * MUI buttons proxy the click.
 */
const visuallyHiddenInputStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * FR-001: single image upload for identification, camera-capture on mobile
 * (`capture="environment"`) and file-picker/drag-drop on desktop. Rejects
 * non-image files client-side (defense in depth; T-014 is the server-side
 * source of truth) before any `onSubmit`/network call.
 */
export function PhotoUploader({
  onSubmit,
  isSubmitting,
  submitError,
  isGuestLimitExceeded = false,
}: PhotoUploaderProps) {
  const messages = getMessages(defaultLocale).scan.upload;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback(
    (file: File | undefined) => {
      if (!file) {
        return;
      }

      if (!file.type.startsWith('image/')) {
        setValidationError(messages.errors.notAnImage);
        setSelectedFile(null);
        return;
      }

      setValidationError(null);
      setSelectedFile(file);
    },
    [messages.errors.notAnImage],
  );

  if (isGuestLimitExceeded) {
    return <RegistrationWall />;
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0]);
    // Reset so re-selecting the same file still fires `onChange`.
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => setIsDragActive(false);

  const handleSubmit = () => {
    if (selectedFile) {
      onSubmit(selectedFile);
    }
  };

  return (
    <Stack spacing={2} data-testid="photo-uploader">
      <Box
        data-testid="photo-dropzone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
        }}
      >
        <Typography variant="body1" gutterBottom>
          {selectedFile ? selectedFile.name : messages.dropHint}
        </Typography>

        <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
          <Button type="button" variant="outlined" onClick={() => galleryInputRef.current?.click()}>
            {messages.chooseFileButton}
          </Button>
          <Button type="button" variant="outlined" onClick={() => cameraInputRef.current?.click()}>
            {messages.captureButton}
          </Button>
        </Stack>

        {/* Desktop / gallery file picker. */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          aria-label={messages.chooseFileButton}
          style={visuallyHiddenInputStyle}
        />
        {/* Mobile direct-camera capture (desktop browsers ignore `capture`). */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleInputChange}
          aria-label={messages.captureButton}
          style={visuallyHiddenInputStyle}
        />
      </Box>

      {validationError && <Alert severity="error">{validationError}</Alert>}
      {submitError && <Alert severity="error">{submitError}</Alert>}

      <Button
        type="button"
        variant="contained"
        disabled={!selectedFile || isSubmitting}
        onClick={handleSubmit}
      >
        {isSubmitting ? messages.submittingButton : messages.submitButton}
      </Button>
    </Stack>
  );
}

export default PhotoUploader;
