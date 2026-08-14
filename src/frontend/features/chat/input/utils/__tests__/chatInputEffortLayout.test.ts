import {
  chatInputEffortLabelGap,
  chatInputEffortLabelHeight,
  chatInputEffortTrackHeight,
  chatInputEffortTrackInset,
  getChatInputEffortOverlayLayout,
} from '../chatInputEffortLayout';

describe('getChatInputEffortOverlayLayout', () => {
  it('expands from the measured gauge into the inset composer toolbar track', () => {
    const gaugeFrame = { height: 32, left: 320, top: 704, width: 32 };
    const layout = getChatInputEffortOverlayLayout(
      { height: 96, left: 16, top: 640, width: 361 },
      gaugeFrame,
    );

    expect(layout).toEqual({
      gaugeFrame,
      labelFrame: {
        height: chatInputEffortLabelHeight,
        left: 16,
        top:
          gaugeFrame.top +
          (gaugeFrame.height - chatInputEffortTrackHeight) / 2 -
          chatInputEffortLabelGap -
          chatInputEffortLabelHeight,
        width: 361,
      },
      sliderFrame: {
        height: chatInputEffortTrackHeight,
        left: 16 + chatInputEffortTrackInset,
        top: gaugeFrame.top + (gaugeFrame.height - chatInputEffortTrackHeight) / 2,
        width: 361 - chatInputEffortTrackInset * 2,
      },
    });
  });

  it('rejects invalid measurements and composers narrower than one track height', () => {
    const gaugeFrame = { height: 32, left: 10, top: 10, width: 32 };

    expect(
      getChatInputEffortOverlayLayout(
        {
          height: 96,
          left: 0,
          top: 0,
          width: chatInputEffortTrackInset * 2 + chatInputEffortTrackHeight - 1,
        },
        gaugeFrame,
      ),
    ).toBeNull();
    expect(
      getChatInputEffortOverlayLayout({ height: 0, left: 0, top: 0, width: 361 }, gaugeFrame),
    ).toBeNull();
  });
});
