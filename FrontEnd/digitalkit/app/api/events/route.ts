const BACKEND_URL =
  process.env.BACKEND_API_URL || "http://localhost:3001";

export const runtime = "nodejs";

export async function GET() {
  console.log("[Proxy] SSE /events connection initiated");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const url = `${BACKEND_URL}/events`;
        console.log(`[Proxy] Connecting to SSE: ${url}`);

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        // Forward the stream
        const forwardStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                console.log("[Proxy] SSE stream ended");
                controller.close();
                break;
              }
              controller.enqueue(value);
            }
          } catch (error) {
            console.error("[Proxy] SSE stream error:", error);
            controller.error(error);
          }
        };

        forwardStream();
      } catch (error) {
        console.error("[Proxy] SSE connection error:", error);
        const errorMessage = `event: error\ndata: ${JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        })}\n\n`;
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
