import type { PromptBuilder, PromptBuildParams, PromptBuildResult } from './types'

export const defaultPromptBuilder: PromptBuilder = {
  build(params: PromptBuildParams): PromptBuildResult {
    const { userPrompt, selectedPresets, isQuickRun } = params

    const additionalSystemPrompt = selectedPresets.map((p) => p.systemPrompt).join('\n\n')

    const prompt = isQuickRun
      ? selectedPresets.map((p) => p.quickPrompt).join('\n\n')
      : userPrompt

    return { prompt, additionalSystemPrompt }
  },
}
