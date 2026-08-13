import { iconRegistry } from '../registry';

describe('iconRegistry', () => {
  it('maps the high-volume action to native speaker symbols', () => {
    expect(iconRegistry).toMatchObject({
      VolumeHighIcon: {
        material: 'volume_up',
        sf: 'speaker.wave.2.fill',
      },
    });
  });
});
