/**
 * Python extractor — structural analysis + call graph.
 * Ported from UA's python extractor.
 *
 * Handles: function_definition, class_definition, decorated_definition,
 * import_statement, import_from_statement, call.
 */

import {
  getStringValue,
  findChild,
} from './base-extractor.mjs'

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
    if (child.type === 'identifier') {
      params.push(child.text)
    } else if (child.type === 'typed_parameter' || child.type === 'default_parameter') {
      const ident = child.childForFieldName('name')
        ?? child.children.find((c) => c.type === 'identifier')
      if (ident) params.push(ident.text)
    } else if (child.type === 'list_splat_pattern' || child.type === 'dictionary_splat_pattern') {
      const ident = child.children.find((c) => c.type === 'identifier')
      if (ident) params.push((child.type === 'dictionary_splat_pattern' ? '**' : '*') + ident.text)
    }
  }
  return params
}

/**
 * Extract return type from a function definition.
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

export class PythonExtractor {
  languageIds = ['python']

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
      this.#processTopLevelNode(node, functions, classes, imports, exports)
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

      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name')
        if (nameNode) {
          functionStack.push(nameNode.text)
          pushedName = true
        }
      }

      if (node.type === 'call') {
        const callee = this.#getCallCallee(node)
        if (callee && functionStack.length > 0) {
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

  // ---- Private helpers ----

  /** @param {import('../ast-adapter.mjs').AstNodeAdapter} node */
  #getCallCallee(node) {
    const funcChild = node.childForFieldName('function')
    if (funcChild) return funcChild.text

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (child && (child.type === 'identifier' || child.type === 'attribute')) {
        return child.text
      }
    }
    return null
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['functions']} functions
   * @param {import('./types.mjs').StructuralAnalysis['classes']} classes
   * @param {import('./types.mjs').StructuralAnalysis['imports']} imports
   * @param {import('./types.mjs').StructuralAnalysis['exports']} exports
   */
  #processTopLevelNode(node, functions, classes, imports, exports) {
    // Unwrap decorated_definition to get the real definition
    let actual = node
    if (node.type === 'decorated_definition') {
      actual = node.children.find(
        (c) => c.type === 'function_definition' || c.type === 'class_definition',
      )
      if (!actual) return
    }

    switch (actual.type) {
      case 'function_definition':
        this.#extractFunction(actual, functions)
        break
      case 'class_definition':
        this.#extractClass(actual, classes)
        break
      case 'import_statement':
        this.#extractImport(actual, imports)
        break
      case 'import_from_statement':
        this.#extractImportFrom(actual, imports)
        break
    }
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['functions']} functions
   */
  #extractFunction(node, functions) {
    const nameNode = node.childForFieldName('name')
    if (!nameNode) return

    const params = extractParams(node.childForFieldName('parameters') ?? null)
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
    const nameNode = node.childForFieldName('name')
    if (!nameNode) return

    /** @type {string[]} */
    const methods = []
    /** @type {string[]} */
    const properties = []

    const body = node.childForFieldName('body')
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const child = body.child(i)
        if (!child) continue
        // Unwrap decorated definitions inside class body
        let actual = child
        if (child.type === 'decorated_definition') {
          actual = child.children.find(
            (c) => c.type === 'function_definition',
          )
          if (!actual) continue
        }
        if (actual.type === 'function_definition') {
          const mName = actual.childForFieldName('name')
          if (mName) methods.push(mName.text)
        } else if (actual.type === 'expression_statement') {
          const assign = actual.children.find((c) => c.type === 'assignment')
          if (assign) {
            const left = assign.childForFieldName('left')
            if (left && left.type === 'identifier') {
              properties.push(left.text)
            }
          }
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
   * @param {import('./types.mjs').StructuralAnalysis['imports']} imports
   */
  #extractImport(node, imports) {
    // `import a.b.c` or `import a.b.c as d`
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (!child) continue
      if (child.type === 'dotted_name' || child.type === 'aliased_import') {
        const nameNode = child.childForFieldName('name') ?? child
        const source = nameNode.text
        imports.push({
          source,
          specifiers: [source],
          lineNumber: node.startPosition.row + 1,
        })
      }
    }
  }

  /**
   * @param {import('../ast-adapter.mjs').AstNodeAdapter} node
   * @param {import('./types.mjs').StructuralAnalysis['imports']} imports
   */
  #extractImportFrom(node, imports) {
    const moduleName = node.childForFieldName('module_name')
    const source = moduleName ? moduleName.text : ''

    /** @type {string[]} */
    const specifiers = []
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i)
      if (!child) continue
      if (child.type === 'dotted_name') {
        specifiers.push(child.text)
      } else if (child.type === 'aliased_import') {
        const name = child.childForFieldName('name')
        if (name) specifiers.push(name.text)
      } else if (child.type === 'wildcard_import') {
        specifiers.push('*')
      }
    }

    imports.push({
      source,
      specifiers,
      lineNumber: node.startPosition.row + 1,
    })
  }
}
