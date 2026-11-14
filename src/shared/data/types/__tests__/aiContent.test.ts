import { AiContentLabelSchema } from '../aiContent';

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
  expect(AiContentLabelSchema.parse(JSON.parse(JSON.stringify(label)))).toEqual(label);
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
