export type PaintingViewerChromeProps = {
  canShare: boolean;
  onShare: () => void;
  aspectRatios: readonly string[];
  onDelete: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onResizeSelect: (ratio: string) => void;
  onViewConversation: () => void;
};
