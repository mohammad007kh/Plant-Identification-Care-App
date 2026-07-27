'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { AdminSpecies, CareGuide } from 'shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { defaultLocale, getMessages } from '@/i18n';
import { useAdminSpecies, useCreateAdminSpecies, useUpdateAdminSpecies } from './use-admin';

/** Structured care-guide fields (mirrors `data-model.md` `care_guide` jsonb). */
const CARE_GUIDE_FIELD_KEYS = [
  'watering',
  'light',
  'soil',
  'humidity',
  'temperature',
  'notes',
] as const;
type CareGuideFieldKey = (typeof CARE_GUIDE_FIELD_KEYS)[number];

const catalogFormSchema = z.object({
  scientificName: z.string().min(1).max(200),
  commonNameFa: z.string().max(200).optional(),
  watering: z.string().optional(),
  light: z.string().optional(),
  soil: z.string().optional(),
  humidity: z.string().optional(),
  temperature: z.string().optional(),
  notes: z.string().optional(),
});
type CatalogFormValues = z.infer<typeof catalogFormSchema>;

const EMPTY_FORM_VALUES: CatalogFormValues = {
  scientificName: '',
  commonNameFa: '',
  watering: '',
  light: '',
  soil: '',
  humidity: '',
  temperature: '',
  notes: '',
};

function readCareGuideField(careGuide: CareGuide | null, key: CareGuideFieldKey): string {
  if (!careGuide) return '';
  const value = careGuide[key];
  return typeof value === 'string' ? value : '';
}

function speciesToFormValues(species: AdminSpecies): CatalogFormValues {
  return {
    scientificName: species.scientificName,
    commonNameFa: species.commonNameFa ?? '',
    watering: readCareGuideField(species.careGuide, 'watering'),
    light: readCareGuideField(species.careGuide, 'light'),
    soil: readCareGuideField(species.careGuide, 'soil'),
    humidity: readCareGuideField(species.careGuide, 'humidity'),
    temperature: readCareGuideField(species.careGuide, 'temperature'),
    notes: readCareGuideField(species.careGuide, 'notes'),
  };
}

function buildCareGuide(values: CatalogFormValues): CareGuide | null {
  const entries = CARE_GUIDE_FIELD_KEYS.map(
    (key) => [key, values[key]?.trim() ?? ''] as const,
  ).filter(([, value]) => value.length > 0);

  return entries.length === 0 ? null : Object.fromEntries(entries);
}

interface SpeciesFormProps {
  messages: ReturnType<typeof getMessages>['admin']['catalog'];
  defaultValues: CatalogFormValues;
  isSubmitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  testId: string;
  onSubmit: (values: CatalogFormValues) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  errorMessage?: string;
}

function SpeciesForm({
  messages,
  defaultValues,
  isSubmitting,
  submitLabel,
  submittingLabel,
  testId,
  onSubmit,
  onCancel,
  cancelLabel,
  errorMessage,
}: SpeciesFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CatalogFormValues>({
    resolver: zodResolver(catalogFormSchema),
    defaultValues,
  });

  const submit = handleSubmit(onSubmit);

  return (
    <Stack component="form" onSubmit={submit} spacing={2} noValidate data-testid={testId}>
      <TextField
        {...register('scientificName')}
        label={messages.form.scientificNameLabel}
        error={!!errors.scientificName}
        helperText={errors.scientificName ? messages.form.errors.scientificNameRequired : undefined}
        fullWidth
      />
      <TextField {...register('commonNameFa')} label={messages.form.commonNameLabel} fullWidth />

      <Typography variant="subtitle2" component="h4" sx={{ mt: 1 }}>
        {messages.form.careGuideHeading}
      </Typography>
      {CARE_GUIDE_FIELD_KEYS.map((key) => (
        <TextField
          key={key}
          {...register(key)}
          label={messages.form.careGuideFields[key]}
          fullWidth
        />
      ))}

      {errorMessage && (
        <Alert severity="error" data-testid={`${testId}-error`}>
          {errorMessage}
        </Alert>
      )}

      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

interface SpeciesRowProps {
  messages: ReturnType<typeof getMessages>['admin']['catalog'];
  species: AdminSpecies;
}

function SpeciesRow({ messages, species }: SpeciesRowProps) {
  const [isEditing, setEditing] = useState(false);
  const updateMutation = useUpdateAdminSpecies();

  const handleSave = (values: CatalogFormValues) => {
    updateMutation.mutate(
      {
        publicId: species.publicId,
        payload: {
          scientificName: values.scientificName,
          commonNameFa: values.commonNameFa?.trim() ? values.commonNameFa.trim() : null,
          careGuide: buildCareGuide(values),
        },
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <Card variant="outlined" data-testid={`catalog-species-${species.publicId}`}>
      <CardContent>
        {isEditing ? (
          <SpeciesForm
            messages={messages}
            defaultValues={speciesToFormValues(species)}
            isSubmitting={updateMutation.isPending}
            submitLabel={messages.form.saveButton}
            submittingLabel={messages.form.savingButton}
            testId={`catalog-edit-form-${species.publicId}`}
            onSubmit={handleSave}
            onCancel={() => {
              updateMutation.reset();
              setEditing(false);
            }}
            cancelLabel={messages.form.cancelButton}
            errorMessage={updateMutation.isError ? messages.form.errors.submitFailed : undefined}
          />
        ) : (
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <div>
              <Typography variant="subtitle1" component="h4">
                {species.scientificName}
              </Typography>
              {species.commonNameFa && (
                <Typography variant="body2" color="text.secondary">
                  {species.commonNameFa}
                </Typography>
              )}
            </div>
            <Button
              type="button"
              variant="outlined"
              size="small"
              onClick={() => setEditing(true)}
              data-testid={`catalog-edit-button-${species.publicId}`}
            >
              {messages.editButton}
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Species/care-guide catalog editor (US9, FR-024): lists every catalog
 * species, lets an admin create a new one, and edit an existing one's
 * scientific/common name + structured care-guide fields inline.
 */
export function CatalogEditor() {
  const messages = getMessages(defaultLocale).admin.catalog;
  const speciesQuery = useAdminSpecies();
  const createMutation = useCreateAdminSpecies();

  const handleCreate = (values: CatalogFormValues) => {
    createMutation.mutate({
      scientificName: values.scientificName,
      commonNameFa: values.commonNameFa?.trim() ? values.commonNameFa.trim() : null,
      careGuide: buildCareGuide(values),
    });
  };

  return (
    <Stack spacing={3} data-testid="catalog-editor">
      <Typography variant="h6" component="h2">
        {messages.heading}
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" component="h3" gutterBottom>
            {messages.createHeading}
          </Typography>
          <SpeciesForm
            // Remounts with fresh empty fields after each successful create
            // (`createMutation.data` changes) — deliberately NOT achieved via
            // `createMutation.reset()`, which would also clear `isSuccess`
            // and hide the success alert below before the admin ever sees it.
            key={createMutation.data?.publicId ?? 'new'}
            messages={messages}
            defaultValues={EMPTY_FORM_VALUES}
            isSubmitting={createMutation.isPending}
            submitLabel={messages.form.createButton}
            submittingLabel={messages.form.creatingButton}
            testId="catalog-create-form"
            onSubmit={handleCreate}
            errorMessage={createMutation.isError ? messages.form.errors.submitFailed : undefined}
          />
          {createMutation.isSuccess && (
            <Alert severity="success" sx={{ mt: 2 }} data-testid="catalog-create-success">
              {messages.createSuccessMessage}
            </Alert>
          )}
        </CardContent>
      </Card>

      {speciesQuery.isLoading && (
        <Stack
          alignItems="center"
          spacing={2}
          role="status"
          aria-live="polite"
          data-testid="catalog-editor-loading"
          sx={{ py: 4 }}
        >
          <CircularProgress aria-label={messages.loadingLabel} />
          <Typography variant="body2">{messages.loadingLabel}</Typography>
        </Stack>
      )}

      {speciesQuery.isError && (
        <Stack spacing={2} data-testid="catalog-editor-error">
          <Alert severity="error">{messages.errorMessage}</Alert>
          <Button type="button" variant="contained" onClick={() => speciesQuery.refetch()}>
            {messages.retryButton}
          </Button>
        </Stack>
      )}

      {speciesQuery.isSuccess && (
        <Stack spacing={2} data-testid="catalog-list">
          {speciesQuery.data.length === 0 ? (
            <Typography variant="body2" color="text.secondary" data-testid="catalog-empty-state">
              {messages.emptyState}
            </Typography>
          ) : (
            speciesQuery.data.map((species) => (
              <SpeciesRow key={species.publicId} messages={messages} species={species} />
            ))
          )}
        </Stack>
      )}
    </Stack>
  );
}

export default CatalogEditor;
