import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  /**
   * Hook into before_agent_start to inject the current model information
   * into the system prompt. This removes the need to hard-code the
   * model name in session-specific configuration files like APPEND_SYSTEM.md.
   */
  pi.on("before_agent_start", async (event, ctx) => {
    const model = ctx.model;
    if (!model) return;

    const modelName = model.name || model.id;
    const provider = model.provider;
    const modelContext = `Current model: ${provider}/${modelName}`;

    return {
      systemPrompt: event.systemPrompt + `\n\n${modelContext}`,
    };
  });
}
