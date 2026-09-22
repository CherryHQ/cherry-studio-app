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

  test('scroll observers see committed state and stop receiving events after cleanup', () => {
    const scroll = createScrollInteraction();
    const observed: boolean[] = [];
    const unsubscribe = scroll.subscribeToScrollStart(() => {
      observed.push(scroll.isActive() && scroll.isRecognitionBlocked());
    });
    scroll.beginDrag();
    scroll.endDrag();
    scroll.beginMomentum();
    expect(observed).toEqual([true, true]);
    unsubscribe();
    scroll.beginDrag();
    expect(observed).toEqual([true, true]);
  });
});
