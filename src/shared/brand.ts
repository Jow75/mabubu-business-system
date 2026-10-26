// The application's name and logo (the owner's decision, 26 Oct 2026). The
// logo is the owner's own artwork, kept as supplied in assets/brand/; every
// file below is made from it by scripts/make-brand-icons.py.
//
// The business name in Settings is separate: it names the family business
// (default "Mabubu") and is printed on reports beside the application's name.

export const APP_NAME = 'NAS Mabubu System';
/** Under an icon on a phone's home screen, where long names are cut. */
export const APP_SHORT_NAME = 'NAS Mabubu';

export const LOGO = {
  /** On screen, up to 52 px (sharp on 2x screens; 19 kB, so it is there at once even on a slow phone). */
  small: '/brand/nas-logo-128.png',
  /** Printed in PDF, Word and Excel reports. */
  report: '/brand/nas-logo-report.png',
} as const;
