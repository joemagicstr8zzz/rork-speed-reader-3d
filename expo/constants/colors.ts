export const appTheme = {
  colors: {
    ink: '#05070D',
    obsidian: '#080B12',
    panel: 'rgba(18, 24, 38, 0.86)',
    panelSolid: '#121826',
    panelElevated: '#172033',
    stroke: 'rgba(255, 255, 255, 0.11)',
    strokeStrong: 'rgba(255, 255, 255, 0.2)',
    text: '#F8FAFC',
    muted: '#8B95A7',
    subtle: '#566176',
    blue: '#54A8FF',
    blueDeep: '#0A84FF',
    cyan: '#5EEAD4',
    amber: '#F8C46B',
    rose: '#FF6B8A',
    green: '#69E18F',
    danger: '#FF5A52',
  },
  radii: {
    sm: 12,
    md: 18,
    lg: 26,
    xl: 34,
  },
  shadows: {
    glowBlue: '#0A84FF',
    glowCyan: '#5EEAD4',
  },
} as const;

export default {
  light: {
    text: appTheme.colors.ink,
    background: appTheme.colors.text,
    tint: appTheme.colors.blueDeep,
    tabIconDefault: appTheme.colors.muted,
    tabIconSelected: appTheme.colors.blueDeep,
  },
};
