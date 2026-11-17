import Svg, { Circle, Path } from 'react-native-svg';
import { withUniwind } from 'uniwind';

const FilterSvg = withUniwind(Svg, {
  width: { fromClassName: 'className', styleProperty: 'width' },
  height: { fromClassName: 'className', styleProperty: 'height' },
  stroke: { fromClassName: 'className', styleProperty: 'color' },
});

/** Hand-drawn adjustment tracks for the model picker's filter action. */
export function ModelPickerFilterIcon({
  className = 'size-5 text-foreground',
}: {
  className?: string;
}) {
  return (
    <FilterSvg
      accessible={false}
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <Path d="M3 7h2.5m5 0H21M3 17h10.5m5 0H21" />
      <Circle cx={8} cy={7} r={2.5} />
      <Circle cx={16} cy={17} r={2.5} />
    </FilterSvg>
  );
}
