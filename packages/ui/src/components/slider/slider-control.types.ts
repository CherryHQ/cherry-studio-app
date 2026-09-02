import type { SliderProps } from './slider.types';

export type SliderControlProps = Omit<SliderProps, 'maximumValueLabel' | 'minimumValueLabel'>;
