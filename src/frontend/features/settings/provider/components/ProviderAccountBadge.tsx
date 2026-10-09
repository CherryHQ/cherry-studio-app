import { Chip } from '@cherrystudio/ui/components';

/** Capability mark only; the containing row owns the translated spoken label. */
export function ProviderAccountBadge() {
  return (
    <Chip.Tag
      accessibilityElementsHidden
      className="shrink-0 self-center rounded-lg px-1.5 py-0.5"
      importantForAccessibility="no-hide-descendants"
    >
      <Chip.Label className="text-xs text-muted-foreground">OAuth</Chip.Label>
    </Chip.Tag>
  );
}
