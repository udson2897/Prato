export const lightColors = {
  surface: '#FFFFFF',
  onSurface: '#1A1817',
  surfaceSecondary: '#F8F8F6',
  onSurfaceSecondary: '#4A4A4A',
  surfaceTertiary: '#EFEFEA',
  onSurfaceTertiary: '#6B6B6B',
  surfaceInverse: '#1A1817',
  onSurfaceInverse: '#FFFFFF',
  brand: '#FF5A00',
  brandPrimary: '#FF5A00',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#FFECE3',
  onBrandSecondary: '#D84C00',
  brandTertiary: '#FFF5F0',
  onBrandTertiary: '#FF5A00',
  success: '#28A745',
  warning: '#FFB800',
  error: '#DC3545',
  info: '#17A2B8',
  border: '#EBEBEB',
  borderStrong: '#D6D6D6',
  divider: '#F0F0F0',
};

export const darkColors: typeof lightColors = {
  surface: '#121212',
  onSurface: '#F5F5F3',
  surfaceSecondary: '#1E1E1E',
  onSurfaceSecondary: '#B5B5B0',
  surfaceTertiary: '#2A2A2A',
  onSurfaceTertiary: '#8C8C88',
  surfaceInverse: '#F5F5F3',
  onSurfaceInverse: '#121212',
  brand: '#FF6A1A',
  brandPrimary: '#FF6A1A',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#3A2417',
  onBrandSecondary: '#FF8A4C',
  brandTertiary: '#241812',
  onBrandTertiary: '#FF7A33',
  success: '#33B85B',
  warning: '#FFC533',
  error: '#F0556B',
  info: '#3AB6C9',
  border: '#2E2E2E',
  borderStrong: '#3E3E3E',
  divider: '#242424',
};

export type Colors = typeof lightColors;

// Live-binding active palette. Reassigned by applyPalette() on theme change.
// Because this is an ES module `let` export, all importers read the current
// value at access time (e.g. inside JSX render), so inline `colors.x` usages
// automatically reflect the active theme after a re-render.
export let colors: Colors = lightColors;

// Registry of StyleSheet rebuilders. Each screen registers a callback that
// recreates its module-level `styles` from the current palette.
type Rebuilder = () => void;
const _rebuilders = new Set<Rebuilder>();

export function registerThemedStyles(fn: Rebuilder): () => void {
  _rebuilders.add(fn);
  return () => _rebuilders.delete(fn);
}

export function applyPalette(next: Colors) {
  colors = next;
  _rebuilders.forEach((fn) => {
    try { fn(); } catch {}
  });
}

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const font = {
  size: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, huge: 32 },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  ACEITO: 'Aceito',
  EM_PREPARO: 'Em preparo',
  SAIU_PARA_ENTREGA: 'Saiu para entrega',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

export const STATUS_COLORS: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: colors.warning,
  ACEITO: colors.info,
  EM_PREPARO: colors.warning,
  SAIU_PARA_ENTREGA: colors.brand,
  FINALIZADO: colors.success,
  CANCELADO: colors.error,
};

export const ORDER_FLOW = [
  'AGUARDANDO_CONFIRMACAO',
  'ACEITO',
  'EM_PREPARO',
  'SAIU_PARA_ENTREGA',
  'FINALIZADO',
];

export const STATUS_DESC: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: 'A loja recebeu seu pedido e vai confirmar em instantes.',
  ACEITO: 'Pedido confirmado! A loja começará a preparar já já.',
  EM_PREPARO: 'Sua comida está sendo preparada com carinho. 🍳',
  SAIU_PARA_ENTREGA: 'O entregador está a caminho do seu endereço. 🛵',
  FINALIZADO: 'Pedido entregue. Bom apetite! 🎉',
  CANCELADO: 'Este pedido foi cancelado.',
};

export const STATUS_ICONS: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: 'receipt-outline',
  ACEITO: 'checkmark-circle-outline',
  EM_PREPARO: 'restaurant-outline',
  SAIU_PARA_ENTREGA: 'bicycle-outline',
  FINALIZADO: 'home-outline',
  CANCELADO: 'close-circle-outline',
};

export const brl = (v: number) =>
  `R$ ${v.toFixed(2).replace('.', ',')}`;
