import { characterPose, ONE_SHOT_SECONDS, statusPose } from '../motion';

const at = (status: number, since: number, previous = 0, previousSince = 0) => ({
  status,
  since,
  previous,
  previousSince,
});

test('a status change starts from the pose already on screen', () => {
  const clock = 7.3;
  const before = characterPose(at(1, 2), clock);
  const after = characterPose(at(3, clock, 1, 2), clock);
  expect(after).toEqual(before);
});

test('completion and failure play once, then settle into the idle pose', () => {
  const clock = 20;
  const idle = statusPose(0, 0, clock);
  expect(statusPose(3, ONE_SHOT_SECONDS.completed + 0.01, clock)).toEqual(idle);
  expect(statusPose(4, ONE_SHOT_SECONDS.failed + 0.01, clock)).toEqual(idle);
  expect(statusPose(3, 0.3, clock)).not.toEqual(idle);
});

test('active states keep moving while idle stays nearly still', () => {
  const travel = (status: number) => {
    let max = 0;
    for (let t = 0; t < 3; t += 0.05) max = Math.max(max, Math.abs(statusPose(status, t, t).y));
    return max;
  };
  expect(travel(0)).toBeLessThan(5);
  expect(travel(1)).toBeGreaterThan(8);
  expect(travel(2)).toBeGreaterThan(30);
});
