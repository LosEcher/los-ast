/**
 * Rust extractor — structural analysis + call graph.
 * Ported from UA's Rust extractor.
 *
 * Handles: function_item, struct_item, enum_item, trait_item, impl_item,
 * use_declaration, call_expression.
 */

import { findChild } from './base-extractor.mjs'

/**
 * Extract parameter names from a parameters node.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter | null} paramsNode
 * @returns {string[]}
 */
function extractParams(paramsNode) {
  if (!paramsNode) return []
  const params = []
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i)
    if (!child) continue

    if (child.type === 'parameter') {
      const pattern = child.childForFieldName('pattern')
      if (pattern) {
        if (pattern.type === 'identifier') {
          params.push(pattern.text)
        } else if (pattern.type === 'mutable_specifier' || pattern.type === 'self_parameter') {
          params.push(pattern.text)
        } else {
          // Try to find an identifier child
          const ident = pattern.children.find((c) => c.type === 'identifier')
          if (ident) params.push(ident.text)
          else params.push(pattern.text)
        }
      }
    } else if (child.type === 'self_parameter') {
      params.push('self')
    } else if (child.type === 'identifier') {
      params.push(child.text)
    }
  }
  return params
}

/**
 * Extract return type from a function item.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @returns {string | undefined}
 */
function extractReturnType(node) {
  const returnType = node.childForFieldName('return_type')
  if (returnType) {
    const text = returnType.text
    return text.startsWith('->') ? text.slice(2).trim() : text
  }
  return undefined
}

/**
 * Extract a Rust use tree into imported name strings.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} useTree
 * @param {string} prefix
 * @returns {string[]}
 */
function extractUseTree(useTree, prefix) {
  const results = []
  if (useTree.type === 'identifier') {
    results.push(prefix ? `${prefix}::${useTree.text}` : useTree.text)
  } else if (useTree.type === 'scoped_identifier') {
    const path = useTree.childForFieldName('path')
    const name = useTree.childForFieldName('name')
    if (path && name) {
      results.push(prefix
        ? `${prefix}::${path.text}::${name.text}`
        : `${path.text}::${name.text}`)
    } else {
      results.push(prefix ? `${prefix}::${useTree.text}` : useTree.text)
    }
  } else if (useTree.type === 'use_list') {
    for (let i = 0; i < useTree.childCount; i++) {
      const child = useTree.child(i)
      if (child) results.push(...extractUseTree(child, prefix))
    }
  } else if (useTree.type === 'use_wildcard') {
    results.push(prefix ? `${prefix}::*` : '*')
  }
  return results
}

export class RustExtractor {
  languageIds = ['rust']

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} rootNode
   * @returns {import('./types.mjs').StructuralAnalysis}
   */
  extractStructure(rootNode) {
    /** @type {import('./types.mjs').StructuralAnalysis['functions']} */
    const functions = []
    /** @type {import('./types.mjs').StructuralAnalysis['classes']} */
    const classes = []
    /** @type {import('./types.mjs').StructuralAnalysis['imports']} */
    const imports = []
    /** @type {import('./types.mjs').StructuralAnalysis['exports']} */
    const exports = []

    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i)
      if (!node) continue

      switch (node.type) {
        case 'function_item': {
          const nameNode = node.childForFieldName('name')
          if (nameNode) {
            const params = extractParams(node.childForFieldName('parameters') ?? null)
            const returnType = extractReturnType(node)
            const isPublic = node.children.some((c) => c.type === 'visibility_modifier' && c.text === 'pub')
            const attrs = this.#hasTestAttribute(node)

            functions.push({
              name: nameNode.text,
              lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
              params,
              returnType,
            })
            if (isPublic && !attrs) {
              exports.push({
                name: nameNode.text,
                lineNumber: node.startPosition.row + 1,
              })
            }
          }
          break
        }
        case 'struct_item': {
          const nameNode = node.childForFieldName('name')
          if (nameNode) {
            const fields = []
            const fieldList = node.childForFieldName('body')
            if (fieldList) {
              for (let j = 0; j < fieldList.childCount; j++) {
                const field = fieldList.child(j)
                if (field && field.type === 'field_declaration') {
                  const fn = field.childForFieldName('name')
                  if (fn) fields.push(fn.text)
                }
              }
            }
            const isPublic = node.children.some((c) => c.type === 'visibility_modifier' && c.text === 'pub')
            classes.push({
              name: nameNode.text,
              lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
              methods: [],
              properties: fields,
            })
            if (isPublic) {
              exports.push({
                name: nameNode.text,
                lineNumber: node.startPosition.row + 1,
              })
            }
          }
          break
        }
        case 'enum_item': {
          const nameNode = node.childForFieldName('name')
          if (nameNode) {
            const variants = []
            const body = node.childForFieldName('body')
            if (body) {
              for (let j = 0; j < body.childCount; j++) {
                const variant = body.child(j)
                if (variant && variant.type === 'enum_variant') {
                  const vn = variant.childForFieldName('name')
                  if (vn) variants.push(vn.text)
                }
              }
            }
            const isPublic = node.children.some((c) => c.type === 'visibility_modifier' && c.text === 'pub')
            classes.push({
              name: nameNode.text,
              lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
              methods: [],
              properties: variants,
            })
            if (isPublic) {
              exports.push({
                name: nameNode.text,
                lineNumber: node.startPosition.row + 1,
              })
            }
          }
          break
        }
        case 'trait_item': {
          const nameNode = node.childForFieldName('name')
          if (nameNode) {
            const methods = []
            const body = node.childForFieldName('body')
            if (body) {
              for (let j = 0; j < body.childCount; j++) {
                const member = body.child(j)
                if (member && member.type === 'function_signature_item') {
                  const mn = member.childForFieldName('name')
                  if (mn) methods.push(mn.text)
                }
              }
            }
            const isPublic = node.children.some((c) => c.type === 'visibility_modifier' && c.text === 'pub')
            classes.push({
              name: nameNode.text,
              lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
              methods,
              properties: [],
            })
            if (isPublic) {
              exports.push({
                name: nameNode.text,
                lineNumber: node.startPosition.row + 1,
              })
            }
          }
          break
        }
        case 'impl_item': {
          const typeNode = node.childForFieldName('type')
          const typeName = typeNode
            ? (typeNode.type === 'type_identifier' ? typeNode.text : null)
            : null
          for (let j = 0; j < node.childCount; j++) {
            const member = node.child(j)
            if (!member) continue
            if (member.type === 'function_item') {
              const mn = member.childForFieldName('name')
              if (mn) {
                const params = extractParams(member.childForFieldName('parameters') ?? null)
                const returnType = extractReturnType(member)
                const isPublic = member.children.some((c) => c.type === 'visibility_modifier' && c.text === 'pub')
                const displayName = typeName
                  ? `${typeName}::${mn.text}`
                  : mn.text
                functions.push({
                  name: displayName,
                  lineRange: [member.startPosition.row + 1, member.endPosition.row + 1],
                  params,
                  returnType,
                })
                if (isPublic && typeName) {
                  exports.push({
                    name: mn.text,
                    lineNumber: member.startPosition.row + 1,
                  })
                }
              }
            }
          }
          break
        }
        case 'use_declaration': {
          for (let j = 0; j < node.childCount; j++) {
            const child = node.child(j)
            if (!child) continue
            if (child.type === 'scoped_use_list') {
              const path = child.childForFieldName('path')
              const prefix = path ? path.text : ''
              const list = child.childForFieldName('list')
              if (list) {
                const items = extractUseTree(list, prefix)
                for (const item of items) {
                  imports.push({
                    source: item,
                    specifiers: [item],
                    lineNumber: node.startPosition.row + 1,
                  })
                }
              }
            } else if (child.type === 'use_as_clause') {
              imports.push({
                source: child.text,
                specifiers: [child.text],
                lineNumber: node.startPosition.row + 1,
              })
            } else if (
              child.type === 'identifier' ||
              child.type === 'scoped_identifier' ||
              child.type === 'use_wildcard'
            ) {
              imports.push({
                source: child.text,
                specifiers: [child.text],
                lineNumber: node.startPosition.row + 1,
              })
            }
          }
          break
        }
      }
    }

    return { functions, classes, imports, exports }
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} rootNode
   * @returns {import('./types.mjs').CallGraphEntry[]}
   */
  extractCallGraph(rootNode) {
    /** @type {import('./types.mjs').CallGraphEntry[]} */
    const entries = []
    /** @type {string[]} */
    const functionStack = []

    const walkForCalls = (node) => {
      let pushedName = false

      if (node.type === 'function_item') {
        const nameNode = node.childForFieldName('name')
        if (nameNode) {
          functionStack.push(nameNode.text)
          pushedName = true
        }
      }

      if (node.type === 'call_expression') {
        const funcChild = node.childForFieldName('function')
        if (funcChild && functionStack.length > 0) {
          let callee = funcChild.text
          // Simplify common patterns for readability
          if (funcChild.type === 'scoped_identifier') {
            const name = funcChild.childForFieldName('name')
            callee = name ? name.text : funcChild.text
          } else if (funcChild.type === 'field_expression') {
            const field = funcChild.childForFieldName('field')
            callee = field ? field.text : funcChild.text
          }
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee,
            lineNumber: node.startPosition.row + 1,
          })
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child) walkForCalls(child)
      }

      if (pushedName) functionStack.pop()
    }

    walkForCalls(rootNode)
    return entries
  }

  /**
   * Check if a function has a #[test] attribute.
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @returns {boolean}
   */
  #hasTestAttribute(node) {
    // Attributes precede the item they annotate as siblings.
    // Only check siblings whose start position is before this node's.
    const parent = node.parent
    if (!parent) return false
    const nodeRow = node.startPosition.row
    const nodeCol = node.startPosition.column
    for (const sibling of parent.children) {
      if (!sibling) continue
      const sRow = sibling.startPosition.row
      const sCol = sibling.startPosition.column
      if (sRow > nodeRow || (sRow === nodeRow && sCol >= nodeCol)) break
      if (sibling.type === 'attribute_item' && sibling.text.includes('test')) {
        return true
      }
    }
    return false
  }
}
