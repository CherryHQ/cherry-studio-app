import { AiContentLabelSchema, AiContentSchema, inheritAiContent } from '../aiContent';
import { FileEntrySchema } from '../file';

const label = AiContentLabelSchema.parse({
  Label: '1',
  ContentProducer: 'ProviderExample',
  ProduceID: 'content-1',
  ReservedCode1: '',
  ContentPropagator: 'RelayExample',
  PropagateID: 'relay-1',
  ReservedCode2: '',
});

test('serializes all seven Annex E fields as strings without private context', () => {
  expect(label).toEqual({
    Label: '1',
    ContentProducer: 'ProviderExample',
    ProduceID: 'content-1',
    ReservedCode1: '',
    ContentPropagator: 'RelayExample',
    PropagateID: 'relay-1',
    ReservedCode2: '',
  });
  expect(AiContentSchema.parse(JSON.parse(JSON.stringify(inheritAiContent(label))))).toEqual({
    version: 1,
    source: 'inherited',
    label,
  });
  expect(AiContentSchema.parse({ version: 1, source: 'generated', label: null }).label).toBeNull();
});

test('accepts upstream uncertainty but rejects noncanonical fields and characters', () => {
  for (const Label of ['2', '3'])
    expect(
      AiContentLabelSchema.safeParse({ ...label, Label, ContentProducer: '', ProduceID: '' })
        .success,
    ).toBe(true);
  for (const invalid of [
    { ...label, Label: 1 },
    { ...label, Label: '0' },
    { ...label, ProduceID: 1 },
    { ...label, ContentProducer: 'Provider Name' },
    { ...label, ContentProducer: '提供者' },
    { ...label, ProduceID: 'a\\b' },
    { ...label, prompt: 'private' },
  ])
    expect(AiContentLabelSchema.safeParse(invalid).success).toBe(false);
});

test('keeps legacy entries unknown and carries AI facts independently of provenance', () => {
  const entry = {
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'report.md',
    mediaType: 'text/markdown',
    provenance: 'generated',
    size: 4,
    createdAt: 1,
    updatedAt: 1,
  };
  expect(FileEntrySchema.parse(entry).aiContent).toBeUndefined();
  expect(FileEntrySchema.parse({ ...entry, aiContent: null }).aiContent).toBeNull();
  const facts = inheritAiContent(label);
  expect(
    FileEntrySchema.parse({ ...entry, provenance: 'imported', aiContent: facts }).aiContent,
  ).toEqual(facts);
  expect(FileEntrySchema.safeParse({ ...entry, aiContent: { ...facts, version: 2 } }).success).toBe(
    false,
  );
});
