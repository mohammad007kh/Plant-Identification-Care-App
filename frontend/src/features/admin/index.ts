// Barrel export — mirrors `features/billing`/`features/plants`'s own
// `index.ts` convention. `frontend/src/app/(fa)/admin/layout.tsx` imports the
// section components directly (not through this barrel) since it composes
// them itself; this barrel exists for any other call site (tests, later
// wiring) that wants the whole feature surface from one import.
export { CatalogEditor } from './catalog-editor';
export { ConfigEditor } from './config-editor';
export { UsersAdmin } from './users-admin';
export { ReportsAdmin } from './reports-admin';
export {
  useIsAdmin,
  useAdminSpecies,
  useCreateAdminSpecies,
  useUpdateAdminSpecies,
  useAdminConfig,
  useUpdateAdminConfig,
  useAdminTiers,
  useUpdateAdminTier,
  useAdminUsers,
  useAdminUser,
  useAdminUserAction,
  useAdminMisidentificationReports,
} from './use-admin';
export { getRoleFromAccessToken, isAdminAccessToken } from './lib/get-role-from-token';
