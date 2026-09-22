import { createScrollInteraction } from '../../scroll-interaction/scroll-interaction';
import { createBackgroundPressInteraction } from '../background-press-interaction';

function createInteraction() {
  const interaction = createBackgroundPressInteraction();
  const scroll = createScrollInteraction();
  const detach = interaction.observeScroll(scroll);
  return { interaction, scroll, detach };
}

describe('background press ownership', () => {
  test('accepts one native tap per eligible touch', () => {
    const { interaction } = createInteraction();
    expect(interaction.commitPress()).toBe(false);
    interaction.beginTouch({});
    expect(interaction.commitPress()).toBe(true);
    expect(interaction.commitPress()).toBe(false);
  });

  test('a touch stopping momentum remains cancelled after momentum ends', () => {
    const { interaction, scroll } = createInteraction();
    scroll.beginMomentum();
    interaction.beginTouch({});
    scroll.endMomentum();
    expect(interaction.commitPress()).toBe(false);

    interaction.beginTouch({});
    expect(interaction.commitPress()).toBe(true);
  });

  test('ending a drag cannot turn the same touch back into a tap', () => {
    const { interaction, scroll } = createInteraction();
    interaction.beginTouch({});
    scroll.beginDrag();
    scroll.endDrag();
    expect(interaction.commitPress()).toBe(false);
  });

  test.each(['before', 'after'] as const)(
    'excludes child content %s parent touch delivery',
    (order) => {
      const { interaction } = createInteraction();
      const touch = {};
      if (order === 'before') interaction.excludeTouch(touch);
      interaction.beginTouch(touch);
      if (order === 'after') interaction.excludeTouch(touch);
      expect(interaction.commitPress()).toBe(false);

      interaction.beginTouch({});
      expect(interaction.commitPress()).toBe(true);
    },
  );

  test('a touch starting during a drag stays cancelled after the drag ends', () => {
    const { interaction, scroll } = createInteraction();
    scroll.beginDrag();
    interaction.beginTouch({});
    scroll.endDrag();
    expect(interaction.commitPress()).toBe(false);
    interaction.beginTouch({});
    expect(interaction.commitPress()).toBe(true);
  });

  test('removing a scrolling list cancels the touch without blocking its replacement', () => {
    const { interaction, scroll, detach } = createInteraction();
    scroll.beginMomentum();
    interaction.beginTouch({});
    detach();
    expect(interaction.commitPress()).toBe(false);
    interaction.beginTouch({});
    expect(interaction.commitPress()).toBe(true);
  });

  test("removing one surface cannot clear another surface's active momentum", () => {
    const { interaction, scroll, detach } = createInteraction();
    const otherScroll = createScrollInteraction();
    interaction.observeScroll(otherScroll);
    scroll.beginMomentum();
    otherScroll.beginMomentum();
    detach();

    interaction.beginTouch({});
    expect(interaction.commitPress()).toBe(false);
    otherScroll.endMomentum();
    interaction.beginTouch({});
    expect(interaction.commitPress()).toBe(true);
  });

  test('a detached surface cannot cancel a new background touch', () => {
    const { interaction, scroll, detach } = createInteraction();
    detach();
    interaction.beginTouch({});
    scroll.beginDrag();
    expect(interaction.commitPress()).toBe(true);
  });
});
