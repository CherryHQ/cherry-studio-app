import { Skeleton } from '@cherrystudio/ui/components';

const defaultSize = 112;

export function FileEntrySkeleton({ size = defaultSize }: { size?: number }) {
  const resolvedSize = Math.max(1, size);

  return (
    <Skeleton
      style={{
        borderRadius: 16,
        height: resolvedSize,
        width: resolvedSize,
      }}
    />
  );
}

export function FileEntryAttachmentSkeleton() {
  return <Skeleton className="h-16 w-full rounded-xl" />;
}
