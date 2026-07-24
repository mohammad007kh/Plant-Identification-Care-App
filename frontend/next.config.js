/**
 * Standard Next.js config.
 *
 * App Router locale segmentation is handled via the `(fa)` route group /
 * `[locale]` folder convention (see `src/app/(fa)/`), NOT via Next's legacy
 * `i18n` config key — that key only applies to the Pages Router and is
 * ignored (with a warning) under the App Router.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
