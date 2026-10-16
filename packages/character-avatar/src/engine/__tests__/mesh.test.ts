import { createCharacterMesh, deformMesh } from '../mesh';
import { statusPose } from '../motion';

const rig = {
  size: 512,
  frame: { center: { x: 256, y: 256 }, side: 480 },
  neck: { x: 256, y: 460 },
  sways: [],
};

test('a rig with only frame and neck still trails the motion above the neck', () => {
  const mesh = createCharacterMesh(rig);
  const pose = statusPose(1, 0.3, 0.3);
  const lag = { ...pose, x: 10, y: -6, rotate: 2 };
  const moved = deformMesh(mesh, lag, pose, rig);
  const top = moved[6]!; // top row, centre column
  const bottom = moved[moved.length - 7]!; // bottom row stays put below the neck
  expect(Math.hypot(top.x - mesh.rest[6]!.x, top.y - mesh.rest[6]!.y)).toBeGreaterThan(5);
  expect(bottom).toEqual(mesh.rest[mesh.rest.length - 7]);
});
