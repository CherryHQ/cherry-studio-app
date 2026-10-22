import { type ReactElement, useEffect, useState } from 'react';
import { processColor, ScrollView, Text, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { resolveTypographyScale, type TypographySizeStep } from '../../../utils/typography-scale';
import { type MermaidRenderResult, renderMermaid } from '../utils/render-mermaid';

const paletteRoles = [
  'foreground',
  'mutedForeground',
  'background',
  'surface',
  'border',
  'outline',
  'chart1',
  'chart2',
  'chart3',
  'chart4',
  'chart5',
] as const;

const paletteVariables = [
  '--color-foreground',
  '--color-muted-foreground',
  '--color-background',
  '--color-secondary',
  '--color-border',
  '--color-foreground-tertiary',
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
];

export type MermaidDiagramProps = {
  source: string;
  fontSizeStep?: TypographySizeStep;
  /** Shown while rendering, on unsupported syntax, or without the native module. */
  fallback?: ReactElement;
};

/** A display-only diagram. Source acquisition, message state and persistence belong to callers. */
export function MermaidDiagram({ source, fontSizeStep = 0, fallback }: MermaidDiagramProps) {
  const colors = useCSSVariable(paletteVariables).map(svgColor);
  const paletteJson = colors.every((color) => color !== null)
    ? JSON.stringify(Object.fromEntries(paletteRoles.map((role, index) => [role, colors[index]])))
    : null;
  const [rendered, setRendered] = useState<{
    source: string;
    paletteJson: string;
    diagram: MermaidRenderResult | null;
  } | null>(null);
  const { fontScale } = useWindowDimensions();

  useEffect(() => {
    if (!paletteJson) return;
    let current = true;
    void renderMermaid(source, paletteJson).then((diagram) => {
      if (current) setRendered({ source, paletteJson, diagram });
    });
    return () => {
      current = false;
    };
  }, [paletteJson, source]);

  const code = fallback ?? (
    <Text className="font-mono text-foreground text-sm" selectable>
      {source}
    </Text>
  );
  // Never show a previous source or theme while its replacement is being laid out.
  const diagram =
    rendered?.source === source && rendered.paletteJson === paletteJson ? rendered.diagram : null;
  const scale = (resolveTypographyScale(fontSizeStep).sm.fontSize / 14) * fontScale;
  if (!diagram || Math.max(diagram.width, diagram.height) * scale > 32_000) return code;

  return (
    <ScrollView className="w-full grow-0" horizontal nestedScrollEnabled>
      <SvgXml
        accessibilityLabel={diagram.accessibilityLabel}
        accessibilityRole="image"
        accessible
        fallback={code}
        height={diagram.height * scale}
        onError={ignoreSvgError}
        role="img"
        width={diagram.width * scale}
        xml={diagram.svg}
      />
    </ScrollView>
  );
}

/** Native color normalization accepts the resolved RGB/OKLCH token output, including alpha. */
function svgColor(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const color = processColor(value);
  if (typeof color !== 'number') return null;
  const rgba = ((color << 8) | (color >>> 24)) >>> 0;
  return `#${rgba.toString(16).padStart(8, '0')}`;
}

function ignoreSvgError() {
  // SvgXml displays the same source fallback if it cannot consume the generated SVG.
}
