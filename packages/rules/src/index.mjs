export const BUILT_IN_RULE_PACKS = Object.freeze({
  'lsclaw-governance': 'projects/lsclaw-governance/**/*.yml',
})

export function getBuiltInRulePackNames() {
  return Object.keys(BUILT_IN_RULE_PACKS)
}

export function getBuiltInRulePackPattern(rulePack) {
  if (!rulePack) return undefined
  return BUILT_IN_RULE_PACKS[rulePack]
}
