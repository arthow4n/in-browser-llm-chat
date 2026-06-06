import { http, HttpResponse } from "msw";

export const llmHandlers = [
  // OpenRouter API
  http.post("https://openrouter.ai/api/v1/chat/completions", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const chunks = ["Hello", " this", " is", " a", " mocked", " OpenRouter", " response."];
          for (const chunk of chunks) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  choices: [{ delta: { content: chunk } }],
                })}\n\n`,
              ),
            );
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new HttpResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return HttpResponse.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello this is a mocked OpenRouter response.",
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });
  }),

  // Google Gemini API
  http.post(
    "https://generativelanguage.googleapis.com/v1beta/models/:model:generateContent",
    async ({ request }) => {
      // Note: Google SDK uses a different format for streaming if requested via query param or body
      // But generateContentStream usually results in a specific response format.
      // Based on the code in graphRunnerActor.ts, it expects `chunk.text` and `chunk.usageMetadata`.

      // If it's a stream request (usually indicated by alt=sse in query params)
      const url = new URL(request.url);
      if (url.searchParams.get("alt") === "sse") {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const chunks = ["Hello", " this", " is", " a", " mocked", " Gemini", " response."];
            for (const chunk of chunks) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    candidates: [{ content: { parts: [{ text: chunk }] } }],
                  })}\n\n`,
                ),
              );
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            // Send usage metadata at the end
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 20,
                  },
                })}\n\n`,
              ),
            );
            controller.close();
          },
        });

        return new HttpResponse(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      return HttpResponse.json({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello this is a mocked Gemini response." }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
        },
      });
    },
  ),
];
