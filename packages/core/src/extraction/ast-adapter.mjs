/**
 * AST node adapter — wraps @ast-grep/napi SgNode to expose a
 * web-tree-sitter-compatible interface so UA extractors port with
 * minimal changes.
 *
 * Mapping:
 *   UA (web-tree-sitter)   →  @ast-grep/napi
 *   ─────────────────────      ──────────────
 *   node.type                 node.kind()
 *   node.text                 node.text()
 *   node.childCount           node.children().length
 *   node.child(i)             node.child(i) ?? null
 *   node.children             node.children()  (already SgNode[])
 *   node.parent               node.parent() ?? null
 *   node.childForFieldName(f) node.field(f) ?? null
 *   node.startPosition.row    node.range().start.line
 *   node.endPosition.row      node.range().end.line
 *
 * Both are 0-indexed for line/column positions.
 */

export class AstNodeAdapter {
  /** @type {import('@ast-grep/napi').SgNode} */
  _sg

  /**
   * @param {import('@ast-grep/napi').SgNode} sgNode
   */
  constructor(sgNode) {
    this._sg = sgNode
  }

  /** Tree-sitter CST node type (e.g. "function_declaration") */
  get type() {
    return this._sg.kind()
  }

  /** Full source text of this node */
  get text() {
    return this._sg.text()
  }

  /** Number of children (named + unnamed) */
  get childCount() {
    return this._sg.children().length
  }

  /**
   * Child at index i (0-based), or null if out of bounds.
   * @param {number} i
   * @returns {AstNodeAdapter | null}
   */
  child(i) {
    const children = this._sg.children()
    const c = children[i]
    return c ? new AstNodeAdapter(c) : null
  }

  /** All children as AstNodeAdapter[] */
  get children() {
    return this._sg.children().map((c) => new AstNodeAdapter(c))
  }

  /** Parent node, or null for root */
  get parent() {
    const p = this._sg.parent()
    return p ? new AstNodeAdapter(p) : null
  }

  /**
   * Child for a named field (e.g. "name", "parameters", "function").
   * Returns null if the field does not exist on this node.
   * @param {string} fieldName
   * @returns {AstNodeAdapter | null}
   */
  childForFieldName(fieldName) {
    const c = this._sg.field(fieldName)
    return c ? new AstNodeAdapter(c) : null
  }

  /** Start position (0-indexed) */
  get startPosition() {
    const range = this._sg.range()
    return { row: range.start.line, column: range.start.column }
  }

  /** End position (0-indexed) */
  get endPosition() {
    const range = this._sg.range()
    return { row: range.end.line, column: range.end.column }
  }

  /**
   * Whether this node is a named node (vs. unnamed/anonymous like "string", ";", etc.).
   * Useful for extractors that need to skip unnamed nodes.
   */
  get isNamed() {
    return this._sg.isNamed()
  }
}

/**
 * Adapt an SgRoot to an AstNodeAdapter wrapping its root node.
 * @param {import('@ast-grep/napi').SgRoot} sgRoot
 * @returns {AstNodeAdapter}
 */
export function adaptRoot(sgRoot) {
  return new AstNodeAdapter(sgRoot.root())
}
