// Numbers shown to the user are formatted for the active locale before they become text (ADR 0014): tal() or kr()
// from src/format.ts, or String() for identifiers that must not be grouped. A raw number renders as "8.5" in
// Swedish. This rule needs type information, so it only runs on files in a TypeScript project.
//
// Reported: a number-typed value passed as an option to t() or i18n.t(), as an entry of <Trans values>, or rendered
// as JSX text (a child expression or a template literal), also through ?:, && and || up to two levels. `count` is
// allowed in options because i18next's plural rules need the raw number. Known gaps: options built in a separate
// variable or spread into the call, and numbers concatenated with + or joined into a string first.

import ts from 'typescript'

const BRANCHES = new Set(['ConditionalExpression', 'LogicalExpression'])
const UI_ATTRIBUTES = new Set([
  'label',
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'hjalp',
  'rubrik',
  'varde',
  'under',
])

/** The JSX container an expression is rendered from, if it is reached through at most two ?:, && or ||. */
function renderedFrom(node) {
  let current = node
  for (let depth = 0; depth <= 2; depth++) {
    const parent = current.parent
    if (parent?.type === 'JSXExpressionContainer') return parent
    if (!parent || !BRANCHES.has(parent.type)) return undefined
    // The test of a ?: is not rendered.
    if (parent.type === 'ConditionalExpression' && parent.test === current) return undefined
    current = parent
  }
  return undefined
}

/** Whether the container's value is shown as text: a JSX child or a user-facing attribute. */
function isTextContainer(container) {
  const parent = container.parent
  if (parent.type === 'JSXElement' || parent.type === 'JSXFragment') return true
  return parent.type === 'JSXAttribute' && UI_ATTRIBUTES.has(parent.name.name)
}

const isTCall = (callee) =>
  (callee.type === 'Identifier' && callee.name === 't') ||
  (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 't')

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Require numbers to be formatted for the locale before they are rendered as text' },
    messages: {
      raw: 'Format this number with tal() or kr() from src/format.ts (String() for identifiers) before it becomes text (ADR 0014).',
    },
    schema: [],
  },
  create(context) {
    const services = context.sourceCode.parserServices
    if (!services?.program) return {}

    const NUMERIC = ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike
    const NULLISH = ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void
    // A number, possibly missing (number | undefined). Wider types such as ReactNode also allow numbers, but there
    // the value is usually text or an element, so flagging them would only be noise.
    const isNumber = (type) => {
      const parts = (type.isUnion() ? type.types : [type]).filter((t) => (t.flags & NULLISH) === 0)
      return parts.length > 0 && parts.every((t) => (t.flags & NUMERIC) !== 0)
    }

    const check = (node) => {
      if (isNumber(services.getTypeAtLocation(node))) context.report({ node, messageId: 'raw' })
    }

    const checkOptions = (object) => {
      for (const property of object.properties) {
        if (property.type !== 'Property') continue
        const name = property.key.type === 'Identifier' ? property.key.name : property.key.value
        if (name !== 'count') check(property.value)
      }
    }

    const isRendered = (node) => {
      const container = renderedFrom(node)
      return container !== undefined && isTextContainer(container)
    }

    return {
      CallExpression(node) {
        const options = node.arguments[1]
        if (isTCall(node.callee) && options?.type === 'ObjectExpression') checkOptions(options)
      },
      JSXAttribute(node) {
        const element = node.parent
        if (
          node.name.name === 'values' &&
          element.name.type === 'JSXIdentifier' &&
          element.name.name === 'Trans' &&
          node.value?.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'ObjectExpression'
        ) {
          checkOptions(node.value.expression)
        }
      },
      'JSXExpressionContainer > *, JSXExpressionContainer ConditionalExpression > *, JSXExpressionContainer LogicalExpression > *'(
        node,
      ) {
        if (BRANCHES.has(node.type) || !isRendered(node)) return
        if (node.type === 'TemplateLiteral') node.expressions.forEach(check)
        else check(node)
      },
    }
  },
}
