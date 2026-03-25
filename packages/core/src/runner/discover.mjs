import fg from 'fast-glob'

export async function discoverFiles({ rootDir, include, ignore }) {
  const patterns = include && include.length ? include : ['**/*']
  const files = await fg(patterns, {
    cwd: rootDir,
    onlyFiles: true,
    absolute: true,
    unique: true,
    dot: false,
    ignore: ignore || [],
  })
  return files
}
