import { cn } from '../../utils';
import { useLockedAppearance } from './locked-context';

/** The owner's mark in a locked component's affordance slot, or after a managed item's name. */
export function LockedMark({ className }: { className?: string }) {
  const { icon: Icon } = useLockedAppearance();
  return <Icon className={cn('size-4 shrink-0 text-muted-foreground', className)} />;
}
