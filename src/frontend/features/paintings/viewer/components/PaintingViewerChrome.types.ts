export type PaintingViewerChromeProps = {
  aspectRatios: readonly string[];
  onDelete: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onResizeSelect: (ratio: string) => void;
  onViewConversation: () => void;
};
