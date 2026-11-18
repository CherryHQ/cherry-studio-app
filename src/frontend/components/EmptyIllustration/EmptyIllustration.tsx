import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

const ILLUSTRATION_WIDTHS = { page: 224, section: 176, panel: 120 };

type Palette = {
  brand: string;
  outline: string;
  surface: string;
  secondary: string;
  white: string;
};

// The original curved strokes and crest from assets/cherry-studio-splash-logo.svg.
const CHERRY_CURVE =
  'M101.23,205.1c-14.47,0-28.11-5.79-38.41-16.29-10.3-10.51-15.98-24.41-15.98-39.16s5.67-28.65,15.98-39.16c10.3-10.51,23.95-16.29,38.41-16.29s28.34,5.92,38.46,16.24c7.54,7.69,7.54,20.16,0,27.85-7.54,7.69-19.77,7.69-27.31,0-2.93-2.99-7-4.71-11.15-4.71-8.54,0-15.76,7.36-15.76,16.07s7.22,16.07,15.76,16.07c4.15,0,8.21-1.72,11.15-4.71,7.54-7.69,19.77-7.69,27.31,0,7.54,7.69,7.54,20.16,0,27.85-10.12,10.32-24.14,16.24-38.46,16.24Z';
const CHERRY_SWIRL =
  'M151.08,255.59c-14.46,0-28.11-5.79-38.41-16.29-10.3-10.51-15.98-24.41-15.98-39.16s5.81-28.89,15.93-39.21c7.54-7.69,19.77-7.69,27.31,0,7.54,7.69,7.54,20.16,0,27.85-2.93,2.99-4.62,7.13-4.62,11.36,0,8.71,7.22,16.07,15.76,16.07s15.76-7.36,15.76-16.07c0-3.08-.75-7.52-4.31-11.15-10.18-10.38-16.01-24.71-16.01-39.34s5.67-28.65,15.98-39.16c10.3-10.51,23.95-16.29,38.41-16.29s28.11,5.79,38.41,16.29c10.3,10.51,15.98,24.41,15.98,39.16s-5.81,28.89-15.93,39.21c-7.54,7.69-19.77,7.69-27.31,0-7.54-7.69-7.54-20.16,0-27.85,2.93-2.99,4.62-7.13,4.62-11.36,0-8.71-7.22-16.07-15.76-16.07s-15.76,7.36-15.76,16.07c0,4.26,1.71,8.45,4.7,11.49,10.07,10.27,15.62,24.12,15.62,39s-5.67,28.65-15.98,39.16c-10.3,10.51-23.95,16.29-38.41,16.29Z';
const CHERRY_CREST =
  'M151.08,100.65l-31.62-29.67c-4.86-4.56-5.11-12.2-.54-17.07,4.56-4.86,12.2-5.11,17.07-.54l12.66,11.89,17.98-22.23c4.19-5.18,11.8-5.99,16.98-1.79,5.18,4.19,5.99,11.8,1.79,16.98l-34.33,42.43Z';

function Connection({ brand, outline, surface, white }: Palette) {
  return (
    <>
      <Path
        d="M187 87c19-3 33 7 33 23 0 17-13 30-30 30-12 0-20-7-20-17"
        stroke={outline}
        strokeWidth={6}
      />
      <G transform="rotate(-9 86 88)">
        <Rect x={40} y={42} width={91} height={91} rx={31} fill={surface} stroke={outline} />
        <Path
          d={CHERRY_CURVE}
          fill={brand}
          fillOpacity={0.34}
          transform="translate(36 15) scale(.5)"
        />
        <Rect x={81} y={85} width={4} height={10} rx={2} fill={outline} />
        <Rect x={91} y={85} width={4} height={10} rx={2} fill={outline} />
      </G>
      <G transform="rotate(-10 164 92)">
        <Path d="M139 85h16m-16 15h16" stroke={outline} strokeWidth={4} />
        <Rect x={149} y={76} width={44} height={31} rx={13} fill={brand} />
        <Path d="M176 87h6" stroke={white} strokeWidth={2.4} />
      </G>
    </>
  );
}

function Conversation({ brand, outline, secondary, surface }: Palette) {
  return (
    <>
      <Path
        d="M143 81h43c16 0 29 13 29 29v5c0 16-13 29-29 29h-1v10c0 2-2 3-4 2l-16-12h-22c-16 0-29-13-29-29v-5c0-16 13-29 29-29Z"
        fill={brand}
        fillOpacity={0.13}
        stroke={outline}
      />
      <G fill={outline}>
        <Circle cx={174} cy={116} r={2.5} />
        <Circle cx={184} cy={116} r={2.5} />
        <Circle cx={194} cy={116} r={2.5} />
      </G>
      <Path
        d="M83 43h52a41 41 0 0 1 0 82H96l-21 14c-2 1-4 0-4-3v-13a41 41 0 0 1 12-80Z"
        fill={surface}
        stroke={outline}
      />
      <Circle cx={109} cy={84} r={28} fill={secondary} />
    </>
  );
}

function Creation({ brand, outline, surface }: Palette) {
  return (
    <>
      <G transform="rotate(-8 116 93)">
        <Rect
          x={57}
          y={44}
          width={118}
          height={98}
          rx={20}
          fill={brand}
          fillOpacity={0.13}
          stroke={outline}
        />
        <Rect x={64} y={51} width={104} height={84} rx={15} fill={surface} />
        <Path
          d="M86 100c0-13 10-23 23-23 12 0 17 9 12 16-3 5-10 8-10 14 0 6 6 11 13 11 11 0 21-9 21-21"
          stroke={brand}
          strokeWidth={9}
        />
      </G>
      <G transform="rotate(31 190 96)">
        <Rect
          x={183}
          y={55}
          width={14}
          height={68}
          rx={7}
          fill={brand}
          fillOpacity={0.34}
          stroke={outline}
        />
        <Path d="M183 111h14v9c0 4-4 11-6 14a1.2 1.2 0 0 1-2 0c-2-3-6-10-6-14Z" fill={brand} />
      </G>
    </>
  );
}

function Collection({ brand, outline, surface }: Palette) {
  return (
    <>
      <Path
        d="M55 72a16 16 0 0 1 16-16h31a13 13 0 0 1 10 5l9 10h61a17 17 0 0 1 17 17v46H55Z"
        fill={brand}
        fillOpacity={0.13}
        stroke={outline}
      />
      <Path
        d="M64 84h132a13 13 0 0 1 12.7 15.7l-7.5 32.7a18 18 0 0 1-17.6 14.1H76.4a18 18 0 0 1-17.6-14.1l-7.5-32.7A13 13 0 0 1 64 84Z"
        fill={surface}
        stroke={outline}
      />
      <G fill={brand} transform="translate(102 89) scale(.185)">
        <Path d={CHERRY_SWIRL} />
        <Path d={CHERRY_CURVE} />
        <Path d={CHERRY_CREST} />
      </G>
    </>
  );
}

function Search({ brand, outline, surface }: Palette) {
  return (
    <>
      <G transform="rotate(-10 99 93)" stroke={outline}>
        <Rect x={63} y={46} width={75} height={95} rx={13} fill={surface} />
        <Path d="M80 66h28M80 76h37" strokeWidth={2} />
      </G>
      <Path d="m165 115 32 25a9 9 0 1 1-11 14l-29-24Z" fill={brand} />
      <Circle cx={138} cy={92} r={41} fill={surface} stroke={outline} />
      <Circle cx={138} cy={92} r={40} fill={brand} fillOpacity={0.13} />
      <Circle cx={138} cy={92} r={32} fill={surface} />
      <Path d="M115 92a23 23 0 0 1 23-23" stroke={brand} strokeOpacity={0.34} strokeWidth={6} />
    </>
  );
}

function Trash({ brand, outline, surface }: Palette) {
  return (
    <>
      <Ellipse cx={130} cy={82} rx={51} ry={10} fill={brand} fillOpacity={0.34} stroke={outline} />
      <Path
        d="M79 82c9 6 28 10 51 10s42-4 51-10l-7 50a20 20 0 0 1-20 17h-48a20 20 0 0 1-20-17Z"
        fill={surface}
        stroke={outline}
      />
      <Path d={CHERRY_CURVE} fill={brand} transform="translate(105 83) scale(.23)" />
      <G transform="rotate(-11 124 60)" stroke={outline}>
        <Path d="M113 53v-4a5 5 0 0 1 5-5h12a5 5 0 0 1 5 5v4" strokeWidth={2.5} />
        <Rect x={73} y={53} width={102} height={14} rx={7} fill={surface} />
        <Rect
          x={73}
          y={53}
          width={102}
          height={14}
          rx={7}
          fill={brand}
          fillOpacity={0.13}
          stroke="none"
        />
      </G>
    </>
  );
}

const SCENES = {
  connection: Connection,
  conversation: Conversation,
  creation: Creation,
  collection: Collection,
  search: Search,
  trash: Trash,
};

type EmptyIllustrationProps = { size?: keyof typeof ILLUSTRATION_WIDTHS } & (
  | { scene: 'conversation'; children?: ReactNode }
  | { scene: Exclude<keyof typeof SCENES, 'conversation'>; children?: never }
);

/** Decorative Cherry artwork. A conversation can place its actual Agent avatar in the bubble. */
export function EmptyIllustration({ children, scene, size = 'page' }: EmptyIllustrationProps) {
  const [brand, outline, surface, secondary, white] = useThemeColor([
    'brand',
    'foreground-tertiary',
    'card',
    'secondary',
    'constant-white',
  ]);
  const Scene = SCENES[scene];

  return (
    <View
      className="relative max-w-full"
      pointerEvents="none"
      style={{ aspectRatio: 260 / 190, width: ILLUSTRATION_WIDTHS[size] }}
    >
      <Svg
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        fill="none"
        height="100%"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        viewBox="0 0 260 190"
        width="100%"
      >
        <Scene
          brand={brand}
          outline={outline}
          surface={surface}
          secondary={secondary}
          white={white}
        />
      </Svg>
      {children ? (
        <View className="absolute top-[29.47%] left-[31.15%] aspect-square w-[21.54%] items-center justify-center">
          {children}
        </View>
      ) : null}
    </View>
  );
}
