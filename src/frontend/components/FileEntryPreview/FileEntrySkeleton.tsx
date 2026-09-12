import { type FilePreviewVariant, Skeleton } from '@cherrystudio/ui/components';

const defaultSize = 112;

export function FileEntrySkeleton({
  size = defaultSize,
  variant = 'thumbnail',
}: {
  size?: number;
  variant?: FilePreviewVariant;
}) {
  const resolvedSize = Math.max(1, size);

  return (
    <Skeleton
      className={variant === 'card' ? 'rounded-4xl' : 'rounded-2xl'}
      style={{
        height: resolvedSize,
        width: resolvedSize,
      }}
    />
  );
}

export function FileEntryAttachmentSkeleton() {
  return <Skeleton className="h-16 w-full rounded-xl" />;
}
