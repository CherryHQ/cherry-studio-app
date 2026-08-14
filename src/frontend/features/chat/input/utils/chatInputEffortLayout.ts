import { effortSliderTrackHeight } from '../effortSlider/utils/effortSliderVisual';

export type ChatInputEffortFrame = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type ChatInputEffortOverlayLayout = {
  gaugeFrame: ChatInputEffortFrame;
  labelFrame: ChatInputEffortFrame;
  sliderFrame: ChatInputEffortFrame;
};

export const chatInputEffortTrackHeight = effortSliderTrackHeight;
export const chatInputEffortTrackInset = 24;
export const chatInputEffortLabelGap = 16;
export const chatInputEffortLabelHeight = 24;
export const chatInputEffortPanelHeight =
  chatInputEffortLabelHeight + chatInputEffortLabelGap + chatInputEffortTrackHeight;

function isValidFrame(frame: ChatInputEffortFrame): boolean {
  return (
    Number.isFinite(frame.height) &&
    Number.isFinite(frame.left) &&
    Number.isFinite(frame.top) &&
    Number.isFinite(frame.width) &&
    frame.height > 0 &&
    frame.width > 0
  );
}

/** Gauge-anchored morph geometry with a viewport-centered resting panel. */
export function getChatInputEffortOverlayLayout(
  composerFrame: ChatInputEffortFrame,
  gaugeFrame: ChatInputEffortFrame,
  viewportFrame: ChatInputEffortFrame,
): ChatInputEffortOverlayLayout | null {
  if (!isValidFrame(composerFrame) || !isValidFrame(gaugeFrame) || !isValidFrame(viewportFrame)) {
    return null;
  }

  const sliderWidth =
    Math.min(composerFrame.width, viewportFrame.width) - chatInputEffortTrackInset * 2;
  if (
    sliderWidth < chatInputEffortTrackHeight ||
    viewportFrame.height < chatInputEffortPanelHeight
  ) {
    return null;
  }

  const panelTop = viewportFrame.top + (viewportFrame.height - chatInputEffortPanelHeight) / 2;
  const sliderFrame = {
    height: chatInputEffortTrackHeight,
    left: viewportFrame.left + (viewportFrame.width - sliderWidth) / 2,
    top: panelTop + chatInputEffortLabelHeight + chatInputEffortLabelGap,
    width: sliderWidth,
  };

  return {
    gaugeFrame,
    labelFrame: {
      height: chatInputEffortLabelHeight,
      left: sliderFrame.left,
      top: panelTop,
      width: sliderWidth,
    },
    sliderFrame,
  };
}
