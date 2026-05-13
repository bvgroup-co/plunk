import {openapi} from '@/lib/openapi';

interface SchemaLike {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  example?: unknown;
  required?: string[];
  properties?: Record<string, SchemaLike>;
  items?: SchemaLike;
  oneOf?: SchemaLike[];
  anyOf?: SchemaLike[];
  allOf?: SchemaLike[];
  nullable?: boolean;
  [key: string]: unknown;
}

interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: SchemaLike;
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, {schema?: SchemaLike}>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, {schema?: SchemaLike}>;
    }
  >;
  security?: Array<Record<string, string[]>>;
}

function typeLabel(schema?: SchemaLike): string {
  if (!schema) return 'unknown';
  if (schema.enum) return `enum (${schema.enum.map(v => JSON.stringify(v)).join(' | ')})`;
  if (schema.oneOf) return schema.oneOf.map(typeLabel).join(' | ');
  if (schema.anyOf) return schema.anyOf.map(typeLabel).join(' | ');
  if (schema.allOf) return schema.allOf.map(typeLabel).join(' & ');
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  const base = schema.type ?? 'object';
  if (base === 'array' && schema.items) return `array<${typeLabel(schema.items)}>`;
  if (schema.format) return `${base} (${schema.format})`;
  return base;
}

function renderSchemaTree(schema: SchemaLike | undefined, depth = 0, lines: string[] = []): string[] {
  if (!schema) return lines;
  const indent = '  '.repeat(depth);

  if (schema.allOf) {
    for (const sub of schema.allOf) renderSchemaTree(sub, depth, lines);
    return lines;
  }

  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required ?? []);
    const props = schema.properties ?? {};
    for (const [name, prop] of Object.entries(props)) {
      const tag = required.has(name) ? ' (required)' : '';
      const desc = prop.description ? ` — ${prop.description.replace(/\n+/g, ' ')}` : '';
      lines.push(`${indent}- \`${name}\`: ${typeLabel(prop)}${tag}${desc}`);
      if (prop.type === 'object' || prop.properties) {
        renderSchemaTree(prop, depth + 1, lines);
      } else if (prop.type === 'array' && prop.items && (prop.items.type === 'object' || prop.items.properties)) {
        lines.push(`${indent}  items:`);
        renderSchemaTree(prop.items, depth + 2, lines);
      }
    }
    return lines;
  }

  if (schema.type === 'array' && schema.items) {
    lines.push(`${indent}- items: ${typeLabel(schema.items)}`);
    renderSchemaTree(schema.items, depth + 1, lines);
  }

  return lines;
}

function exampleFromSchema(schema?: SchemaLike): unknown {
  if (!schema) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.allOf) {
    const merged: Record<string, unknown> = {};
    for (const sub of schema.allOf) Object.assign(merged, exampleFromSchema(sub) as object ?? {});
    return merged;
  }
  if (schema.oneOf?.[0]) return exampleFromSchema(schema.oneOf[0]);
  if (schema.anyOf?.[0]) return exampleFromSchema(schema.anyOf[0]);

  if (schema.properties) {
    const out: Record<string, unknown> = {};
    const required = new Set(schema.required ?? Object.keys(schema.properties));
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (!required.has(name) && schema.required) continue;
      out[name] = exampleFromSchema(prop);
    }
    return out;
  }

  if (schema.type === 'array') {
    const item = exampleFromSchema(schema.items);
    return item === undefined ? [] : [item];
  }

  switch (schema.type) {
    case 'string':
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
      return 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return null;
  }
}

function findOperationByMethodPath(
  doc: {paths?: Record<string, Record<string, Operation>>},
  method: string,
  path: string,
): Operation | undefined {
  const pathItem = doc.paths?.[path];
  return pathItem?.[method.toLowerCase()];
}

function extractOperationRef(mdxBody: string): {method: string; path: string} | undefined {
  const block = mdxBody.match(/operations=\{(\[[\s\S]*?\])\}/);
  if (!block) return undefined;
  const pathMatch = block[1].match(/['"]?path['"]?\s*:\s*['"]([^'"]+)['"]/);
  const methodMatch = block[1].match(/['"]?method['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (!pathMatch || !methodMatch) return undefined;
  return {path: pathMatch[1], method: methodMatch[1]};
}

export async function renderOpenAPIOperationFromMDX(
  mdxBody: string,
  fallbackTitle: string,
  pageUrl: string,
): Promise<string | undefined> {
  const ref = extractOperationRef(mdxBody);
  if (!ref) return undefined;

  const schemas = await openapi.getSchemas();
  const first = Object.values(schemas)[0];
  if (!first) return undefined;

  const doc = first.dereferenced as {
    servers?: Array<{url: string}>;
    paths?: Record<string, Record<string, Operation>>;
  };
  const op = findOperationByMethodPath(doc, ref.method, ref.path);
  if (!op) return undefined;

  const lines: string[] = [];
  const method = ref.method.toUpperCase();
  const baseUrl = doc.servers?.[0]?.url ?? '';

  lines.push(`# ${op.summary ?? fallbackTitle} (${pageUrl})`);
  lines.push('');
  lines.push(`\`${method} ${ref.path}\``);
  lines.push('');
  if (baseUrl) {
    lines.push(`Base URL: \`${baseUrl}\``);
    lines.push('');
  }
  if (op.description) {
    lines.push(op.description);
    lines.push('');
  }
  if (op.deprecated) {
    lines.push('> **Deprecated.** This endpoint should not be used in new integrations.');
    lines.push('');
  }

  if (op.parameters && op.parameters.length > 0) {
    const grouped: Record<string, Parameter[]> = {};
    for (const p of op.parameters) (grouped[p.in] ??= []).push(p);
    for (const [location, params] of Object.entries(grouped)) {
      lines.push(`## ${location[0].toUpperCase()}${location.slice(1)} parameters`);
      lines.push('');
      for (const p of params) {
        const req = p.required ? ' (required)' : '';
        const desc = p.description ? ` — ${p.description.replace(/\n+/g, ' ')}` : '';
        lines.push(`- \`${p.name}\`: ${typeLabel(p.schema)}${req}${desc}`);
      }
      lines.push('');
    }
  }

  const body = op.requestBody?.content?.['application/json']?.schema;
  if (body) {
    lines.push('## Request body');
    lines.push('');
    if (op.requestBody?.description) {
      lines.push(op.requestBody.description);
      lines.push('');
    }
    const tree = renderSchemaTree(body);
    if (tree.length > 0) {
      lines.push(...tree);
      lines.push('');
    }
    const example = exampleFromSchema(body);
    if (example !== undefined) {
      lines.push('Example:');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(example, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  if (op.responses) {
    lines.push('## Responses');
    lines.push('');
    for (const [status, resp] of Object.entries(op.responses)) {
      const desc = resp.description ? ` — ${resp.description.replace(/\n+/g, ' ')}` : '';
      lines.push(`### \`${status}\`${desc}`);
      lines.push('');
      const schema = resp.content?.['application/json']?.schema;
      if (schema) {
        const tree = renderSchemaTree(schema);
        if (tree.length > 0) {
          lines.push(...tree);
          lines.push('');
        }
        const example = exampleFromSchema(schema);
        if (example !== undefined) {
          lines.push('```json');
          lines.push(JSON.stringify(example, null, 2));
          lines.push('```');
          lines.push('');
        }
      }
    }
  }

  if (baseUrl) {
    lines.push('## Example request');
    lines.push('');
    lines.push('```bash');
    const curlParts = [`curl -X ${method} '${baseUrl}${ref.path}'`, "  -H 'Authorization: Bearer YOUR_API_KEY'"];
    if (body) {
      curlParts.push("  -H 'Content-Type: application/json'");
      const example = exampleFromSchema(body);
      curlParts.push(`  -d '${JSON.stringify(example)}'`);
    }
    lines.push(curlParts.join(' \\\n'));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}
