export type ThemeName = 'neon' | 'plain'

export interface Theme {
  name: ThemeName
  bg: string
  panel: string
  ink: string
  muted: string
  /** One colour per role slot. Exactly three, which is the role cap in core/card.ts. */
  roles: [string, string, string]
  /** Used for the one loose arc a card may have, never for a role. */
  accent: string
  glow: boolean
}

/**
 * A theme changes colour and stroke treatment only.
 *
 * It never touches the geometry, so the same card carries the same information in
 * either theme. There is a test that strips the paint attributes from both renders and
 * compares the coordinates, because otherwise that is just a promise.
 */
export const THEMES: Record<ThemeName, Theme> = {
  neon: {
    name: 'neon',
    bg: '#0e1320', panel: '#12192a', ink: '#f1f5f9', muted: '#8798ad',
    roles: ['#22d3ee', '#a78bfa', '#34d399'],
    accent: '#f472b6', glow: true,
  },
  plain: {
    name: 'plain',
    bg: '#fbfaf8', panel: '#ffffff', ink: '#1c1a17', muted: '#6f6960',
    roles: ['#3a6b4f', '#5f5e5a', '#9a5b2c'],
    accent: '#9a5b2c', glow: false,
  },
}

export function themeByName(name: string | undefined): Theme {
  return THEMES[name === 'plain' ? 'plain' : 'neon']
}
