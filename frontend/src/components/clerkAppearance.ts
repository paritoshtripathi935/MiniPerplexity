import type { Appearance } from '@clerk/types';

// PaidPilot dark theme mapped onto Clerk's appearance API. Clerk reads these
// as inline styles, not CSS vars, so values are flat hex/rgba copies of the
// tokens defined in index.css. Keep this file in sync with that palette.
const surface = '#141218';
const surfaceRaised = '#211f24';
const surfaceSunken = '#0e0c11';
const border = 'rgba(255, 255, 255, 0.08)';
const borderStrong = 'rgba(255, 255, 255, 0.16)';
const fg = '#e6e0e9';
const fgMuted = '#cac4d0';
const fgSubtle = '#948f99';
const brand = '#7C5CFF';
const brandStop2 = '#3B82F6';
const danger = '#ffb4ab';

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: brand,
    colorBackground: surface,
    colorText: fg,
    colorTextSecondary: fgMuted,
    colorTextOnPrimaryBackground: '#ffffff',
    colorInputBackground: surfaceRaised,
    colorInputText: fg,
    colorNeutral: '#ffffff',
    colorDanger: danger,
    colorSuccess: '#34d399',
    colorWarning: '#fbbf24',
    fontFamily:
      'InterVariable, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    fontFamilyButtons:
      'InterVariable, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    fontWeight: { normal: '400', medium: '500', semibold: '600', bold: '600' },
    borderRadius: '0.625rem',
    spacingUnit: '1rem',
  },
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    cardBox: {
      backgroundColor: 'transparent',
      boxShadow: 'none',
      border: 'none',
      borderRadius: '0',
      marginInline: 'auto',
    },
    card: {
      backgroundColor: 'transparent',
      boxShadow: 'none',
      border: 'none',
      padding: '0',
    },
    headerTitle: { display: 'none' },
    headerSubtitle: { display: 'none' },
    main: { gap: '1rem' },

    socialButtonsBlockButton: {
      backgroundColor: surfaceRaised,
      border: `1px solid ${border}`,
      color: fg,
      fontWeight: 500,
      borderRadius: '0.625rem',
      transition: 'border-color 150ms ease, background-color 150ms ease',
      '&:hover': {
        backgroundColor: '#2b292e',
        borderColor: borderStrong,
      },
      '&:focus': { boxShadow: `0 0 0 2px ${surface}, 0 0 0 4px rgba(124,92,255,0.6)` },
    },
    socialButtonsBlockButtonText: { color: fg, fontWeight: 500 },
    socialButtonsProviderIcon: { filter: 'none' },

    dividerLine: { backgroundColor: border },
    dividerText: { color: fgSubtle, fontSize: '12px', textTransform: 'lowercase' as const },

    formFieldLabel: { color: fgMuted, fontWeight: 500, fontSize: '13px' },
    formFieldInput: {
      backgroundColor: surfaceRaised,
      border: `1px solid ${border}`,
      color: fg,
      borderRadius: '0.5rem',
      padding: '0.625rem 0.75rem',
      transition: 'border-color 150ms ease, box-shadow 150ms ease',
      '&:focus': {
        borderColor: brand,
        boxShadow: `0 0 0 2px ${surface}, 0 0 0 4px rgba(124,92,255,0.45)`,
      },
      '&::placeholder': { color: fgSubtle },
    },
    formFieldInputShowPasswordButton: { color: fgSubtle, '&:hover': { color: fg } },
    formFieldAction: {
      color: brand,
      fontWeight: 500,
      '&:hover': { color: '#a892ff' },
    },
    formFieldHintText: { color: fgSubtle },
    formFieldErrorText: { color: danger },

    formButtonPrimary: {
      backgroundImage: `linear-gradient(135deg, ${brand} 0%, ${brandStop2} 100%)`,
      backgroundColor: brand,
      color: '#ffffff',
      fontWeight: 600,
      borderRadius: '0.625rem',
      padding: '0.75rem 1rem',
      boxShadow: '0 0 24px rgba(124,92,255,0.3)',
      textTransform: 'none' as const,
      letterSpacing: '0',
      transition: 'box-shadow 150ms ease, transform 100ms ease',
      '&:hover': {
        backgroundImage: `linear-gradient(135deg, ${brand} 0%, ${brandStop2} 100%)`,
        boxShadow: '0 0 32px rgba(124,92,255,0.5)',
      },
      '&:active': { transform: 'scale(0.99)' },
      '&:focus': {
        boxShadow: `0 0 0 2px ${surface}, 0 0 0 4px rgba(124,92,255,0.6), 0 0 32px rgba(124,92,255,0.4)`,
      },
    },

    footer: { background: 'transparent', borderTop: `1px solid ${border}`, marginTop: '1rem' },
    footerActionText: { color: fgMuted, fontSize: '13px' },
    footerActionLink: {
      color: brand,
      fontWeight: 500,
      '&:hover': { color: '#a892ff' },
    },

    identityPreview: {
      backgroundColor: surfaceRaised,
      border: `1px solid ${border}`,
      borderRadius: '0.625rem',
    },
    identityPreviewText: { color: fg },
    identityPreviewEditButton: { color: brand },

    otpCodeFieldInput: {
      backgroundColor: surfaceRaised,
      border: `1px solid ${border}`,
      color: fg,
      borderRadius: '0.5rem',
      '&:focus': {
        borderColor: brand,
        boxShadow: `0 0 0 2px ${surface}, 0 0 0 4px rgba(124,92,255,0.45)`,
      },
    },

    alert: {
      backgroundColor: surfaceSunken,
      border: `1px solid ${border}`,
      borderRadius: '0.5rem',
      color: fg,
    },
    alertText: { color: fg, fontSize: '13px' },

    badge: {
      backgroundColor: 'rgba(124,92,255,0.1)',
      color: brand,
      border: `1px solid rgba(124,92,255,0.3)`,
      fontWeight: 500,
    },

    spinner: { color: brand },

    formResendCodeLink: { color: brand },
    backLink: { color: fgMuted, '&:hover': { color: fg } },

    userPreview: { color: fg },
    userPreviewMainIdentifier: { color: fg },
    userPreviewSecondaryIdentifier: { color: fgSubtle },
  },
};
