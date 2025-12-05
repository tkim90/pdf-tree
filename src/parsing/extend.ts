import type { Chunk } from "../schemas/tree";

export interface ParsedDocument {
  chunks: Chunk[];
  rawContent: string;
}

interface ExtendBlock {
  type: string;
  content: string;
  metadata?: {
    pageNumber?: number;
  };
}

interface ExtendChunk {
  content: string;
  blocks: ExtendBlock[];
  metadata?: {
    pageNumber?: number;
  };
}

interface ExtendParseResponse {
  chunks: ExtendChunk[];
}

export async function parseWithExtend(pdfUrl: string): Promise<ParsedDocument> {
  const apiKey = process.env.EXTEND_API_KEY;
  if (!apiKey) {
    throw new Error("EXTEND_API_KEY environment variable is not set");
  }

  const response = await fetch("https://api.extend.ai/parse", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "x-extend-api-version": "2025-04-21",
    },
    body: JSON.stringify({
      file: {
        fileName: "document.pdf",
        fileUrl: pdfUrl,
      },
      config: {
        target: "spatial",
        chunkingStrategy: {
          type: "page",
        },
        blockOptions: {
          figures: {
            enabled: false,
          },
          tables: {
            targetFormat: "markdown",
            tableHeaderContinuationEnabled: true,
          },
          text: {
            signatureDetectionEnabled: true,
          },
        },
        advancedOptions: {
          pageRotationEnabled: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Extend API error: ${response.status} - ${JSON.stringify(errorData)}`
    );
  }

  const data = (await response.json()) as ExtendParseResponse;

  const chunks: Chunk[] = data.chunks.map((chunk, index) => ({
    content: chunk.content,
    page: chunk.metadata?.pageNumber ?? index + 1,
  }));

  const rawContent = chunks.map((c) => c.content).join("\n\n");

  return { chunks, rawContent };
}
