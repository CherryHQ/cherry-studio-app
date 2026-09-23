import { createScrollInteraction } from '../scroll-interaction';

describe('scroll interaction ownership', () => {
  test('a touch that stops momentum stays blocked until the next touch', () => {
    const scroll = createScrollInteraction();
    scroll.beginMomentum();
    scroll.beginTouch();
    scroll.endMomentum();
    expect(scroll.isActive()).toBe(false);
    expect(scroll.isRecognitionBlocked()).toBe(true);
    scroll.beginTouch();
    expect(scroll.isRecognitionBlocked()).toBe(false);
  });

  test('a completed drag cannot become a press from the same touch', () => {
    const scroll = createScrollInteraction();
    scroll.beginTouch();
    scroll.beginDrag();
    scroll.endDrag();
    expect(scroll.isRecognitionBlocked()).toBe(true);
    scroll.beginTouch();
    expect(scroll.isRecognitionBlocked()).toBe(false);
  });

  test('ending momentum cannot clear a drag that has already taken over', () => {
    const scroll = createScrollInteraction();
    scroll.beginMomentum();
    scroll.beginDrag();
    scroll.endMomentum();
    scroll.beginTouch();
    expect(scroll.isActive()).toBe(true);
    expect(scroll.isRecognitionBlocked()).toBe(true);
  });
});
