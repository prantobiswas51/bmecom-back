/** The store's colours. Each one has a job; the storefront and admin derive the rest (tints, borders) from them. */
export interface ThemeColors {
  /** Headings, main buttons, header. */
  primary: string;
  /** Hover and pressed state of primary. */
  primaryDark: string;
  /** Call-to-action buttons, badges, highlights. */
  secondary: string;
  /** Hover and pressed state of secondary, and secondary text on light backgrounds. */
  secondaryDark: string;
  /** Soft panel and chip backgrounds. */
  tertiary: string;
  /** Success and positive messages. */
  accent: string;
  /** Body text. */
  other: string;
}

export const THEME_KEYS = [
  'primary',
  'primaryDark',
  'secondary',
  'secondaryDark',
  'tertiary',
  'accent',
  'other',
] as const satisfies readonly (keyof ThemeColors)[];

export const DEFAULT_THEME: ThemeColors = {
  primary: '#0e0f51',
  primaryDark: '#080f4f',
  secondary: '#f97316',
  secondaryDark: '#c2410c',
  tertiary: '#f4f6ff',
  accent: '#15803d',
  other: '#111827',
};

export interface CurrencySetting {
  /** ISO code, e.g. BDT. */
  code: string;
  /** What is printed next to amounts, e.g. ৳. */
  symbol: string;
  position: 'before' | 'after';
  /** Digits after the point. Prices are whole numbers today, so 0. */
  decimals: 0 | 2;
}

export const DEFAULT_CURRENCY: CurrencySetting = { code: 'BDT', symbol: '৳', position: 'before', decimals: 0 };
