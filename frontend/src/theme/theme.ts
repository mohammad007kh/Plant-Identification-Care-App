import { createTheme } from '@mui/material/styles';

/**
 * MUI theme for the Persian/RTL shell (FR-029).
 *
 * `direction: 'rtl'` combined with the Emotion cache in `rtl-cache.ts`
 * (stylis-plugin-rtl) gives MUI's own components correct RTL layout.
 * Font family points at the self-hosted Vazirmatn declared in
 * `./fonts/vazirmatn.css` (imported once, globally, from the root layout).
 *
 * Palette/spacing tokens here are intentionally minimal — full design
 * tokens are out of scope for this skeleton task.
 */
export const theme = createTheme({
  direction: 'rtl',
  typography: {
    fontFamily: 'Vazirmatn, Arial, sans-serif',
  },
  palette: {
    mode: 'light',
    primary: {
      main: '#2e7d32',
    },
    secondary: {
      main: '#6d4c41',
    },
  },
});

export default theme;
