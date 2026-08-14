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

/** Geometry for the floating slider, derived from the live composer and gauge. */
export function getChatInputEffortOverlayLayout(
  composerFrame: ChatInputEffortFrame,
  gaugeFrame: ChatInputEffortFrame,
): ChatInputEffortOverlayLayout | null {
  if (!isValidFrame(composerFrame) || !isValidFrame(gaugeFrame)) {
    return null;
  }

  const sliderWidth = composerFrame.width - chatInputEffortTrackInset * 2;
  if (sliderWidth < chatInputEffortTrackHeight) {
    return null;
  }

  const sliderFrame = {
    height: chatInputEffortTrackHeight,
    left: composerFrame.left + chatInputEffortTrackInset,
    top: gaugeFrame.top + (gaugeFrame.height - chatInputEffortTrackHeight) / 2,
    width: sliderWidth,
  };

  return {
    gaugeFrame,
    labelFrame: {
      height: chatInputEffortLabelHeight,
      left: composerFrame.left,
      top: sliderFrame.top - chatInputEffortLabelGap - chatInputEffortLabelHeight,
      width: composerFrame.width,
    },
    sliderFrame,
  };
}
