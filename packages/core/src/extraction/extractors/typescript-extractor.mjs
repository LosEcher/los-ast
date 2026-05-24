/**
 * TypeScript / JavaScript extractor — structural analysis + call graph.
 * Ported from UA's typescript-extractor.ts.
 *
 * Handles: function_declaration, class_declaration, arrow_function,
 * method_definition, call_expression, import_statement, export_statement,
 * lexical_declaration, variable_declaration.
 */

import {
  getStringValue,
  findChild,
} from './base-extractor.mjs'

// ---------------------------------------------------------------------------
// Parameter extraction
// ---------------------------------------------------------------------------

/**
 * Extract parameter names from a formal_parameters node.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter | null} paramsNode
 * @returns {string[]}
 */
function extractParams(paramsNode) {
  if (!paramsNode) return []
  const params = []
  for (let i = 0; i < paramsNode.childCount; i++) {
    const child = paramsNode.child(i)
    if (!child) continue
    if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
      const ident = child.childForFieldName('pattern') ?? child.childForFieldName('name')
      if (ident) {
        params.push(ident.text)
      } else {
        for (let j = 0; j < child.childCount; j++) {
          const c = child.child(j)
          if (c && c.type === 'identifier') {
            params.push(c.text)
            break
          }
        }
      }
    } else if (child.type === 'identifier') {
      params.push(child.text)
    } else if (child.type === 'rest_pattern' || child.type === 'rest_element') {
      const ident = child.children.find((c) => c.type === 'identifier')
      if (ident) params.push('...' + ident.text)
    }
  }
  return params
}

// ---------------------------------------------------------------------------
// Return type extraction
// ---------------------------------------------------------------------------

/**
 * Extract return type annotation from a function-like node.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
 * @returns {string | undefined}
 */
function extractReturnType(node) {
  const typeAnnotation = node.childForFieldName('return_type')
  if (typeAnnotation && typeAnnotation.type === 'type_annotation') {
    const text = typeAnnotation.text
    return text.startsWith(':') ? text.slice(1).trim() : text
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Import specifiers
// ---------------------------------------------------------------------------

/**
 * Extract import specifiers from an import_clause node.
 * @param {import('../ast-adapter.mjs').AstNodeAdapter} importClause
 * @returns {string[]}
 */
function extractImportSpecifiers(importClause) {
  const specifiers = []
  for (let i = 0; i < importClause.childCount; i++) {
    const child = importClause.child(i)
    if (!child) continue
    if (child.type === 'named_imports') {
      for (let j = 0; j < child.childCount; j++) {
        const spec = child.child(j)
        if (spec && spec.type === 'import_specifier') {
          const alias = spec.childForFieldName('alias')
          const name = spec.childForFieldName('name')
          specifiers.push(alias ? alias.text : name ? name.text : spec.text)
        }
      }
    } else if (child.type === 'namespace_import') {
      const ident = child.children.find((c) => c.type === 'identifier')
      if (ident) specifiers.push('* as ' + ident.text)
    } else if (child.type === 'identifier') {
      specifiers.push(child.text)
    }
  }
  return specifiers
}

// ---------------------------------------------------------------------------
// Main extractor class
// ---------------------------------------------------------------------------

export class TypeScriptExtractor {
  languageIds = ['typescript', 'javascript', 'tsx', 'jsx']

  /**
   * Extract structural analysis from the CST root.
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
    const exportedNames = new Set()

    for (let i = 0; i < rootNode.childCount; i++) {
      const node = rootNode.child(i)
      if (!node) continue
      this.#processTopLevelNode(node, functions, classes, imports, exports, exportedNames)
    }

    return { functions, classes, imports, exports }
  }

  /**
   * Extract call graph from the CST root.
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} rootNode
   * @returns {import('./types.mjs').CallGraphEntry[]}
   */
  extractCallGraph(rootNode) {
    /** @type {import('./types.mjs').CallGraphEntry[]} */
    const entries = []
    /** @type {string[]} */
    const functionStack = []

    const walkForCalls = (node) => {
      const isFunctionLike =
        node.type === 'function_declaration' ||
        node.type === 'method_definition' ||
        node.type === 'arrow_function' ||
        node.type === 'function_expression'

      let pushedName = false
      if (isFunctionLike) {
        let name
        if (node.type === 'function_declaration') {
          name = (node.childForFieldName('name') ??
            node.children.find((c) => c.type === 'identifier'))?.text
        } else if (node.type === 'method_definition') {
          name = node.children.find((c) => c.type === 'property_identifier')?.text
        } else if (node.type === 'arrow_function' || node.type === 'function_expression') {
          const parent = node.parent
          if (parent && parent.type === 'variable_declarator') {
            name = parent.childForFieldName('name')?.text
          }
        }
        if (name) {
          functionStack.push(name)
          pushedName = true
        }
      }

      if (node.type === 'call_expression') {
        const callee = node.childForFieldName('function')
        if (callee && functionStack.length > 0) {
          entries.push({
            caller: functionStack[functionStack.length - 1],
            callee: callee.text,
            lineNumber: node.startPosition.row + 1,
          })
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i)
        if (child) walkForCalls(child)
      }

      if (pushedName) {
        functionStack.pop()
      }
    }

    walkForCalls(rootNode)
    return entries
  }

  // ---- Private helpers ----

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['functions']} functions
   * @param {import('./types.mjs').StructuralAnalysis['classes']} classes
   * @param {import('./types.mjs').StructuralAnalysis['imports']} imports
   * @param {import('./types.mjs').StructuralAnalysis['exports']} exports
   * @param {Set<string>} exportedNames
   */
  #processTopLevelNode(node, functions, classes, imports, exports, exportedNames) {
    switch (node.type) {
      case 'function_declaration':
        this.#extractFunction(node, functions)
        break
      case 'class_declaration':
        this.#extractClass(node, classes)
        break
      case 'lexical_declaration':
      case 'variable_declaration':
        this.#extractVariableDeclarations(node, functions)
        break
      case 'import_statement':
        this.#extractImport(node, imports)
        break
      case 'export_statement':
        this.#processExportStatement(node, functions, classes, imports, exports, exportedNames)
        break
    }
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['functions']} functions
   */
  #extractFunction(node, functions) {
    const nameNode =
      node.childForFieldName('name') ??
      node.children.find((c) => c.type === 'identifier')
    if (!nameNode) return

    const params = extractParams(
      node.childForFieldName('parameters') ??
        node.children.find((c) => c.type === 'formal_parameters') ??
        null,
    )
    const returnType = extractReturnType(node)

    functions.push({
      name: nameNode.text,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      params,
      returnType,
    })
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['classes']} classes
   */
  #extractClass(node, classes) {
    const nameNode = node.children.find(
      (c) => c.type === 'type_identifier' || c.type === 'identifier',
    )
    if (!nameNode) return

    /** @type {string[]} */
    const methods = []
    /** @type {string[]} */
    const properties = []

    const classBody = node.children.find((c) => c.type === 'class_body')
    if (classBody) {
      for (let j = 0; j < classBody.childCount; j++) {
        const member = classBody.child(j)
        if (!member) continue

        if (member.type === 'method_definition') {
          const methodName = member.children.find((c) => c.type === 'property_identifier')
          if (methodName) methods.push(methodName.text)
        } else if (
          member.type === 'public_field_definition' ||
          member.type === 'property_definition'
        ) {
          const propName = member.children.find((c) => c.type === 'property_identifier')
          if (propName) properties.push(propName.text)
        }
      }
    }

    classes.push({
      name: nameNode.text,
      lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
      methods,
      properties,
    })
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['functions']} functions
   */
  #extractVariableDeclarations(node, functions) {
    for (let j = 0; j < node.childCount; j++) {
      const child = node.child(j)
      if (!child || child.type !== 'variable_declarator') continue

      const nameNode = child.childForFieldName('name')
      const valueNode = child.childForFieldName('value')

      if (
        nameNode &&
        valueNode &&
        (valueNode.type === 'arrow_function' ||
          valueNode.type === 'function_expression' ||
          valueNode.type === 'function')
      ) {
        const params = extractParams(
          valueNode.childForFieldName('parameters') ??
            valueNode.children.find((c) => c.type === 'formal_parameters') ??
            null,
        )
        const returnType = extractReturnType(valueNode)

        functions.push({
          name: nameNode.text,
          lineRange: [node.startPosition.row + 1, node.endPosition.row + 1],
          params,
          returnType,
        })
      }
    }
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['imports']} imports
   */
  #extractImport(node, imports) {
    const sourceNode = node.children.find((c) => c.type === 'string')
    if (!sourceNode) return

    const source = getStringValue(sourceNode)
    /** @type {string[]} */
    const specifiers = []

    const importClause = node.children.find((c) => c.type === 'import_clause')
    if (importClause) {
      specifiers.push(...extractImportSpecifiers(importClause))
    }

    imports.push({
      source,
      specifiers,
      lineNumber: node.startPosition.row + 1,
    })
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['functions']} functions
   * @param {import('./types.mjs').StructuralAnalysis['classes']} classes
   * @param {import('./types.mjs').StructuralAnalysis['imports']} _imports
   * @param {import('./types.mjs').StructuralAnalysis['exports']} exports
   * @param {Set<string>} exportedNames
   */
  #processExportStatement(node, functions, classes, _imports, exports, exportedNames) {
    for (let j = 0; j < node.childCount; j++) {
      const child = node.child(j)
      if (!child) continue

      switch (child.type) {
        case 'function_declaration': {
          this.#extractFunction(child, functions)
          const nameNode =
            child.childForFieldName('name') ??
            child.children.find((c) => c.type === 'identifier')
          const isDefault = node.children.some((c) => c.type === 'default')
          if (nameNode && !exportedNames.has(nameNode.text)) {
            exports.push({
              name: nameNode.text,
              lineNumber: node.startPosition.row + 1,
              isDefault,
            })
            exportedNames.add(nameNode.text)
          } else if (!nameNode && isDefault && !exportedNames.has('default')) {
            exports.push({
              name: 'default',
              lineNumber: node.startPosition.row + 1,
              isDefault: true,
            })
            exportedNames.add('default')
          }
          break
        }
        case 'class_declaration': {
          this.#extractClass(child, classes)
          const nameNode = child.children.find(
            (c) => c.type === 'type_identifier' || c.type === 'identifier',
          )
          const isDefault = node.children.some((c) => c.type === 'default')
          if (nameNode && !exportedNames.has(nameNode.text)) {
            const exportName = isDefault ? 'default' : nameNode.text
            exports.push({
              name: exportName,
              lineNumber: node.startPosition.row + 1,
              isDefault,
            })
            exportedNames.add(exportName)
          }
          break
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          this.#extractVariableDeclarations(child, functions)
          for (let k = 0; k < child.childCount; k++) {
            const declarator = child.child(k)
            if (declarator && declarator.type === 'variable_declarator') {
              const nameNode = declarator.childForFieldName('name')
              if (nameNode && !exportedNames.has(nameNode.text)) {
                exports.push({
                  name: nameNode.text,
                  lineNumber: node.startPosition.row + 1,
                })
                exportedNames.add(nameNode.text)
              }
            }
          }
          break
        }
        case 'export_clause': {
          for (let k = 0; k < child.childCount; k++) {
            const spec = child.child(k)
            if (spec && spec.type === 'export_specifier') {
              const alias = spec.childForFieldName('alias')
              const name = spec.childForFieldName('name')
              const exportName = alias ? alias.text : name ? name.text : spec.text
              if (!exportedNames.has(exportName)) {
                exports.push({
                  name: exportName,
                  lineNumber: node.startPosition.row + 1,
                })
                exportedNames.add(exportName)
              }
            }
          }
          break
        }
      }
    }
  }
}
