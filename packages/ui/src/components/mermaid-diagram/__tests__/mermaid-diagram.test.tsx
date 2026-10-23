import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MermaidDiagram } from '../components/mermaid-diagram';
import type { MermaidRenderResult } from '../utils/render-mermaid';

const mockRequests: {
  source: string;
  resolve: (result: MermaidRenderResult | null) => void;
}[] = [];
let mockColor = 'black';

jest.mock('uniwind', () => ({
  useCSSVariable: (variables: string[]) => variables.map(() => mockColor),
}));

jest.mock('../utils/render-mermaid', () => ({
  renderMermaid: (source: string) =>
    new Promise((resolve) => mockRequests.push({ source, resolve })),
}));

jest.mock('react-native-svg', () => {
  const { createElement } = jest.requireActual('react');
  return { SvgXml: (props: object) => createElement('DiagramImage', props) };
});

function diagram(label: string): MermaidRenderResult {
  return { svg: label, accessibilityLabel: label, width: 500, height: 200 };
}

describe('MermaidDiagram', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    mockRequests.length = 0;
    mockColor = 'black';
    act(() => {
      renderer = create(<MermaidDiagram source="first" />);
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('keeps source visible when rendering fails', async () => {
    await act(async () => {
      mockRequests[0].resolve(null);
    });
    expect(renderer.root.findAllByType('DiagramImage')).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain('first');
  });

  test('rejects a stale completion after its source changes', async () => {
    act(() => renderer.update(<MermaidDiagram source="second" />));
    await act(async () => {
      mockRequests[1].resolve(diagram('second'));
    });
    expect(renderer.root.findByType('DiagramImage').props.xml).toBe('second');
    await act(async () => {
      mockRequests[0].resolve(diagram('first'));
    });
    expect(renderer.root.findByType('DiagramImage').props.xml).toBe('second');
  });

  test('hides a previous theme while its replacement is pending', async () => {
    await act(async () => {
      mockRequests[0].resolve(diagram('light'));
    });
    mockColor = 'white';
    act(() => renderer.update(<MermaidDiagram source="first" />));
    expect(renderer.root.findAllByType('DiagramImage')).toHaveLength(0);
    await act(async () => {
      mockRequests[1].resolve(diagram('dark'));
    });
    expect(renderer.root.findByType('DiagramImage').props.xml).toBe('dark');
  });
});
