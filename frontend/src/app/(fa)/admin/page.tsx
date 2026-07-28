/**
 * Route registration only. `AdminLayout` (`../admin/layout.tsx`) owns and
 * renders the entire admin UI itself (role gate + tabs + all four sections)
 * and renders this segment's `children` below that — Next.js still requires
 * a `page.tsx` to exist for `/admin` to be a renderable route at all, so this
 * file exists purely to satisfy that, with no content of its own.
 */
export default function AdminPage() {
  return null;
}
