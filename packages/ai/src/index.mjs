import path from 'node:path'

export function outputSchemaPath() {
  return path.resolve(new URL('../schemas/los-ast-output.schema.json', import.meta.url).pathname)
}
