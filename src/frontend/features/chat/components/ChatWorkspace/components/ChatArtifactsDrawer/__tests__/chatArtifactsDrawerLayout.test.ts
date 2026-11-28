import {
  avoidTurnDirectoryY,
  clampHandleY,
  ratioToY,
  resolvePopoverPosition,
  resolveSnapSide,
  yToRatio,
} from '../chatArtifactsDrawerLayout';

describe('artifacts drawer geometry', () => {
  test('clamps a handle and preserves its relative height when the keyboard changes the bounds', () => {
    expect(clampHandleY(0, 100, 600)).toBe(100);
    expect(clampHandleY(700, 100, 600)).toBe(600);
    const ratio = yToRatio(225, 100, 600);
    expect(ratio).toBe(0.25);
    expect(ratioToY(ratio, 100, 400)).toBe(175);
    expect(ratioToY(2, 100, 400)).toBe(400);
    expect(ratioToY(-1, 100, 400)).toBe(100);
    expect(ratioToY(0.5, 100, 100)).toBe(100);
    expect(yToRatio(100, 100, 100)).toBe(0);
  });

  test('projects a flick across the midpoint and otherwise snaps to the nearer edge', () => {
    expect(resolveSnapSide(190, 0, 400)).toBe('left');
    expect(resolveSnapSide(200, 0, 400)).toBe('right');
    expect(resolveSnapSide(170, 500, 400)).toBe('right');
    expect(resolveSnapSide(230, -500, 400)).toBe('left');
  });

  test('clears the turn rail using the nearest available docking point', () => {
    expect(avoidTurnDirectoryY(130, 300, 100, 550)).toBe(130);
    expect(avoidTurnDirectoryY(238, 300, 100, 550)).toBe(202);
    expect(avoidTurnDirectoryY(330, 300, 100, 550)).toBe(342);
    expect(avoidTurnDirectoryY(270, 300, 220, 550)).toBe(342);
    expect(avoidTurnDirectoryY(270, 300, 100, 310)).toBe(202);
  });

  test('anchors against either edge and keeps the full panel inside the available area', () => {
    const area = { containerWidth: 390, minY: 110, maxY: 610, popoverHeight: 200 };
    expect(resolvePopoverPosition({ ...area, side: 'left', handleY: 200 })).toEqual({
      left: 12,
      top: 200,
      width: 280,
      maxHeight: 500,
    });
    expect(resolvePopoverPosition({ ...area, side: 'right', handleY: 570 })).toEqual({
      left: 98,
      top: 410,
      width: 280,
      maxHeight: 500,
    });
    expect(resolvePopoverPosition({ ...area, side: 'right', handleY: 0 }).top).toBe(110);
    expect(
      resolvePopoverPosition({
        ...area,
        side: 'right',
        handleY: 200,
        maxY: 160,
        containerWidth: 250,
      }),
    ).toEqual({
      left: 12,
      top: 110,
      width: 226,
      maxHeight: 50,
    });
  });
});
