import { readFileSync } from 'node:fs';

const generated = `${process.cwd()}/packages/ui/nitrogen/generated/ios/c++/views`;

// React Native 0.87+ asserts that component views start with default props. Nitrogen 0.36.4 omits
// them; the patch backports the initializer from Nitro #1506 until the installed Nitro has it.
describe('nitrogen iOS view props patch', () => {
  test.each(['HybridCherryMenuView', 'HybridCherryBackgroundPressView'])(
    'initializes %s with its default shared props',
    (view) => {
      expect(readFileSync(`${generated}/${view}Component.mm`, 'utf8')).toMatch(
        new RegExp(
          `if \\(self = \\[super init\\]\\) \\{\\s+_props = ${view}ShadowNode::defaultSharedProps\\(\\);`,
        ),
      );
    },
  );
});
