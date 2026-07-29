type PropertySchema = Record<string, unknown>;
type InputSchema = {
  properties?: Record<string, PropertySchema>;
  required?: string[];
};

const MAX_NESTING_DEPTH = 5;

export function schemaToJSDoc(
  toolName: string,
  description: string | undefined,
  inputSchema: unknown,
): string {
  const schema =
    inputSchema && typeof inputSchema === 'object' ? (inputSchema as InputSchema) : undefined;
  const lines = ['/**', ` * ${(description || toolName).trim() || toolName}`];
  const properties = schema?.properties ?? {};
  if (Object.keys(properties).length > 0) {
    lines.push(' *', ' * @param {Object} params - Parameters');
    appendPropertyParams(lines, properties, new Set(schema?.required ?? []), 'params');
  }
  lines.push(' */', `function ${toolName}(params) {}`);
  return lines.join('\n');
}

function appendPropertyParams(
  lines: string[],
  properties: Record<string, PropertySchema>,
  required: Set<string>,
  prefix: string,
  depth = 0,
): void {
  if (depth >= MAX_NESTING_DEPTH) return;
  for (const name of Object.keys(properties).sort((left, right) => left.localeCompare(right))) {
    const property = properties[name];
    const isRequired = required.has(name);
    const path = isRequired ? `${prefix}.${name}` : `[${prefix}.${name}]`;
    const description =
      typeof property.description === 'string' ? property.description.trim().split('\n')[0] : '';
    const suffix = isRequired
      ? description
        ? `${description} (required)`
        : '(required)'
      : description;
    lines.push(
      suffix
        ? ` * @param {${schemaType(property)}} ${path} - ${suffix}`
        : ` * @param {${schemaType(property)}} ${path}`,
    );

    if (property.type === 'object' && property.properties) {
      appendPropertyParams(
        lines,
        property.properties as Record<string, PropertySchema>,
        new Set(Array.isArray(property.required) ? (property.required as string[]) : []),
        `${prefix}.${name}`,
        depth + 1,
      );
    }
  }
}

function schemaType(property: PropertySchema): string {
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    return property.enum.map((value) => JSON.stringify(value)).join('|');
  }
  if (property.type === 'integer' || property.type === 'number') return 'number';
  if (property.type === 'array') return 'Array';
  if (property.type === 'object') return 'Object';
  if (property.type === 'boolean') return 'boolean';
  if (property.type === 'string') return 'string';
  return '*';
}
