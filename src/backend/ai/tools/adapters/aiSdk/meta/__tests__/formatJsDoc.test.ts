import { schemaToJSDoc } from '../formatJsDoc';

describe('schemaToJSDoc', () => {
  test('formats union types and nested object-array properties like desktop', () => {
    const output = schemaToJSDoc('example_tool', 'Example tool', {
      properties: {
        mode: { type: ['string', 'number'] },
        rows: {
          items: {
            properties: {
              id: { description: 'Row id', type: 'integer' },
              note: { type: 'string' },
            },
            required: ['id'],
            type: 'object',
          },
          type: 'array',
        },
      },
      required: ['mode', 'rows'],
      type: 'object',
    });

    expect(output).toContain('@param {string|number} params.mode - (required)');
    expect(output).toContain('@param {Array} params.rows - (required)');
    expect(output).toContain('@param {number} params.rows[].id - Row id (required)');
    expect(output).toContain('@param {string} [params.rows[].note]');
  });
});
