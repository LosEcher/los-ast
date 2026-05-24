/**
 * Shared CST traversal helpers for language extractors.
 * Ported from UA's base-extractor.ts — same algorithms,
 * adapted to work with AstNodeAdapter instead of web-tree-sitter Node.
 */

/**
 * Recursively traverse an AST tree, calling visitor for each node.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @param {(node: import('../ast-adapter.mjs').AstNodeAdapter) => void} visitor
 */
export function traverse(node, visitor) {
  visitor(node)
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) traverse(child, visitor)
  }
}

/**
 * Extract the unquoted string value from a string-like node.
 * For tree-sitter's `string` nodes: finds `string_fragment` children,
 * otherwise strips surrounding quotes.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @returns {string}
 */
export function getStringValue(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child && child.type === 'string_fragment') {
      return child.text
    }
  }
  return node.text.replace(/^['"`]|['"`]$/g, '')
}

/**
 * Find the first child matching a type.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @param {string} type
 * @returns {import('../ast-adapter.mjs').AstNodeAdapter | null}
 */
export function findChild(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child && child.type === type) return child
  }
  return null
}

/**
 * Find all children matching a type.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @param {string} type
 * @returns {import('../ast-adapter.mjs').AstNodeAdapter[]}
 */
export function findChildren(node, type) {
  const result = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child && child.type === type) result.push(child)
  }
  return result
}

/**
 * Check if a node has a child of the given type.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @param {string} type
 * @returns {boolean}
 */
export function hasChildOfType(node, type) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child && child.type === type) return true
  }
  return false
}
