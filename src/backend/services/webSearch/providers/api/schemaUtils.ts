type SchemaIssue = {
  path: string;
  expected: string;
};

export function assertRecord(value: unknown, path = 'payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwSchemaIssue({ path, expected: 'object' });
  }

  return value as Record<string, unknown>;
}

export function readString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throwSchemaIssue({ path, expected: 'string' });
  }

  return value;
}

export function readOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readString(value, path);
}

export function readNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwSchemaIssue({ path, expected: 'number' });
  }

  return value;
}

export function readNumberOrString(value: unknown, path: string): number | string {
  if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string') {
    return value;
  }

  throwSchemaIssue({ path, expected: 'number|string' });
}

export function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throwSchemaIssue({ path, expected: 'array' });
  }

  return value;
}

export function readOptionalArray(value: unknown, path: string): unknown[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readArray(value, path);
}

export function readObject(value: unknown, path: string): Record<string, unknown> {
  return assertRecord(value, path);
}

export function readOptionalObject(
  value: unknown,
  path: string,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readObject(value, path);
}

export function readObjectArray(value: unknown, path: string): Record<string, unknown>[] {
  return readArray(value, path).map((item, index) => readObject(item, `${path}[${index}]`));
}

export function readOptionalObjectArray(
  value: unknown,
  path: string,
): Record<string, unknown>[] | undefined {
  const array = readOptionalArray(value, path);
  return array?.map((item, index) => readObject(item, `${path}[${index}]`));
}

export function throwSchemaIssue(issue: SchemaIssue): never {
  throw new Error(`${issue.path} must be ${issue.expected}`);
}
