import {
  chatInputEffortLabelGap,
  chatInputEffortLabelHeight,
  chatInputEffortPanelHeight,
  chatInputEffortTrackHeight,
  chatInputEffortTrackInset,
  getChatInputEffortOverlayLayout,
} from '../chatInputEffortLayout';

describe('getChatInputEffortOverlayLayout', () => {
  it('expands from the measured gauge into a viewport-centered panel', () => {
    const gaugeFrame = { height: 32, left: 320, top: 704, width: 32 };
    const viewportFrame = { height: 874, left: 0, top: 0, width: 402 };
    const sliderWidth = 361 - chatInputEffortTrackInset * 2;
    const panelTop = (viewportFrame.height - chatInputEffortPanelHeight) / 2;
    const layout = getChatInputEffortOverlayLayout(
      { height: 96, left: 16, top: 640, width: 361 },
      gaugeFrame,
      viewportFrame,
    );

    expect(layout).toEqual({
      gaugeFrame,
      labelFrame: {
        height: chatInputEffortLabelHeight,
        left: (viewportFrame.width - sliderWidth) / 2,
        top: panelTop,
        width: sliderWidth,
      },
      sliderFrame: {
        height: chatInputEffortTrackHeight,
        left: (viewportFrame.width - sliderWidth) / 2,
        top: panelTop + chatInputEffortLabelHeight + chatInputEffortLabelGap,
        width: sliderWidth,
      },
    });
  });

  it('keeps the panel centered when the keyboard moves the composer and gauge', () => {
    const viewportFrame = { height: 874, left: 0, top: 0, width: 402 };
    const composerFrame = { height: 96, left: 16, top: 640, width: 361 };
    const closedLayout = getChatInputEffortOverlayLayout(
      composerFrame,
      { height: 32, left: 320, top: 704, width: 32 },
      viewportFrame,
    );
    const keyboardLayout = getChatInputEffortOverlayLayout(
      { ...composerFrame, top: 343 },
      { height: 32, left: 320, top: 407, width: 32 },
      viewportFrame,
    );

    expect(keyboardLayout?.labelFrame).toEqual(closedLayout?.labelFrame);
    expect(keyboardLayout?.sliderFrame).toEqual(closedLayout?.sliderFrame);
  });

  it('rejects invalid measurements and frames too small for the centered panel', () => {
    const gaugeFrame = { height: 32, left: 10, top: 10, width: 32 };
    const viewportFrame = { height: 874, left: 0, top: 0, width: 402 };

    expect(
      getChatInputEffortOverlayLayout(
        {
          height: 96,
          left: 0,
          top: 0,
          width: chatInputEffortTrackInset * 2 + chatInputEffortTrackHeight - 1,
        },
        gaugeFrame,
        viewportFrame,
      ),
    ).toBeNull();
    expect(
      getChatInputEffortOverlayLayout(
        { height: 0, left: 0, top: 0, width: 361 },
        gaugeFrame,
        viewportFrame,
      ),
    ).toBeNull();
    expect(
      getChatInputEffortOverlayLayout({ height: 96, left: 0, top: 0, width: 361 }, gaugeFrame, {
        ...viewportFrame,
        height: chatInputEffortPanelHeight - 1,
      }),
    ).toBeNull();
  });
});
