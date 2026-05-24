/**
 * Go extractor — structural analysis + call graph.
 * Ported from UA's Go extractor.
 *
 * Handles: function_declaration, method_declaration, type_declaration
 * (struct_type, interface_type), import_declaration, call_expression.
 */

import { findChild } from './base-extractor.mjs'

/**
 * Extract parameter names from a parameter_list node.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter | null} paramsNode
 * @returns {string[]}
 */
function extractParams(paramsNode) {
  if (!paramsNode) return []
  const params = []
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i)
    if (!child) continue
    if (child.type === 'parameter_declaration') {
      const names = []
      for (let j = 0; j < child.childCount; j++) {
        const c = child.child(j)
        if (c && c.type === 'identifier') names.push(c.text)
      }
      if (names.length > 0) params.push(names.join(', '))
    }
  }
  return params
}

/**
 * Extract return type from a function/method declaration.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @returns {string | undefined}
 */
function extractReturnType(node) {
  const result = node.childForFieldName('result')
  if (result) {
    return result.text
  }
  return undefined
}

/**
 * Extract import paths from an import_declaration.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @returns {string[]}
 */
function extractGoImportPaths(node) {
  const paths = []
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (!child) continue
    if (child.type === 'import_spec') {
      const pathNode = child.children.find(
        (c) => c.type === 'interpreted_string_literal',
      )
      if (pathNode) {
        paths.push(pathNode.text.replace(/^"|"$/g, ''))
      }
    } else if (child.type === 'import_spec_list') {
      for (let j = 0; j < child.childCount; j++) {
        const spec = child.child(j)
        if (spec && spec.type === 'import_spec') {
          const pathNode = spec.children.find(
            (c) => c.type === 'interpreted_string_literal',
          )
          if (pathNode) {
            paths.push(pathNode.text.replace(/^"|"$/g, ''))
          }
        }
      }
    }
  }
  return paths
}

export class GoExtractor {
  languageIds = ['go']

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
        case 'function_declaration': {
          const nameNode = node.childForFieldName('name') ??
            node.children.find((c) => c.type === 'identifier')
          if (nameNode) {
            const params = extractParams(node.childForFieldName('parameters') ?? null)
            const returnType = extractReturnType(node)
            functions.push({
              name: nameNode.text,
              lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
              params,
              returnType,
            })
            if (/^[A-Z]/.test(nameNode.text)) {
              exports.push({
                name: nameNode.text,
                lineNumber: node.startPosition.row + 1,
              })
            }
          }
          break
        }
        case 'method_declaration': {
          const nameNode = node.childForFieldName('name') ??
            node.children.find((c) => c.type === 'field_identifier')
          if (nameNode) {
            const receiver = node.childForFieldName('receiver')
            let receiverType = ''
            if (receiver) {
              const typeNode = receiver.children.find(
                (c) => c.type === 'type_identifier' || c.type === 'pointer_type',
              )
              if (typeNode) receiverType = typeNode.text
            }
            const params = extractParams(node.childForFieldName('parameters') ?? null)
            const returnType = extractReturnType(node)
            const displayName = receiverType
              ? `${receiverType}.${nameNode.text}`
              : nameNode.text
            functions.push({
              name: displayName,
              lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
              params,
              returnType,
            })
            if (/^[A-Z]/.test(nameNode.text)) {
              exports.push({
                name: nameNode.text,
                lineNumber: node.startPosition.row + 1,
              })
            }
          }
          break
        }
        case 'type_declaration': {
          for (let j = 0; j < node.childCount; j++) {
            const spec = node.child(j)
            if (!spec || spec.type !== 'type_spec') continue
            const nameNode = spec.childForFieldName('name')
            if (!nameNode) continue
            const typeNode = spec.childForFieldName('type')
            if (!typeNode) continue

            if (typeNode.type === 'struct_type') {
              const fields = []
              const fieldList = findChild(typeNode, 'field_declaration_list')
              if (fieldList) {
                for (let k = 0; k < fieldList.childCount; k++) {
                  const field = fieldList.child(k)
                  if (field && field.type === 'field_declaration') {
                    const fieldName = field.childForFieldName('name')
                    if (fieldName) fields.push(fieldName.text)
                  }
                }
              }
              classes.push({
                name: nameNode.text,
                lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
                methods: [],
                properties: fields,
              })
              if (/^[A-Z]/.test(nameNode.text)) {
                exports.push({
                  name: nameNode.text,
                  lineNumber: node.startPosition.row + 1,
                })
              }
            } else if (typeNode.type === 'interface_type') {
              const methods = []
              for (let k = 0; k < typeNode.childCount; k++) {
                const member = typeNode.child(k)
                if (member && (member.type === 'method_spec' || member.type === 'method_declaration')) {
                  const mn = member.childForFieldName('name') ??
                    member.children.find((c) => c.type === 'field_identifier')
                  if (mn) methods.push(mn.text)
                }
              }
              classes.push({
                name: nameNode.text,
                lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
                methods,
                properties: [],
              })
            }
          }
          break
        }
        case 'import_declaration': {
          const paths = extractGoImportPaths(node)
          for (const path of paths) {
            imports.push({
              source: path,
              specifiers: [path],
              lineNumber: node.startPosition.row + 1,
            })
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

      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name') ??
          node.children.find((c) => c.type === 'identifier')
        if (nameNode) {
          functionStack.push(nameNode.text)
          pushedName = true
        }
      } else if (node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name') ??
          node.children.find((c) => c.type === 'field_identifier')
        if (nameNode) {
          functionStack.push(nameNode.text)
          pushedName = true
        }
      }

      if (node.type === 'call_expression') {
        const funcChild = node.childForFieldName('function')
        if (funcChild && functionStack.length > 0) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee: funcChild.text,
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
}
