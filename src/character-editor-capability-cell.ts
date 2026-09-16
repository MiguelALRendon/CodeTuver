import type { AxisCapability } from './character-editor';

export interface CapabilityCellProps {
  disabled: boolean;
  ariaLabel: string;
  title: string | undefined;
}

// Paga la deuda de docs/TECH_DEBT.md: mismo patron disabled/aria-label/title, antes copiado 4 veces en CharacterEditor.vue.
export function capabilityCellProps(
  axisLabel: string,
  state: string,
  capability: AxisCapability,
  supportedDetail?: string,
): CapabilityCellProps {
  if (!capability.supported) {
    return {
      disabled: true,
      ariaLabel: `${axisLabel} deshabilitada: ${capability.reason}`,
      title: capability.reason ?? undefined,
    };
  }
  return {
    disabled: false,
    ariaLabel: supportedDetail
      ? `${axisLabel} para ${state}: ${supportedDetail}`
      : `${axisLabel} para ${state}`,
    title: undefined,
  };
}
