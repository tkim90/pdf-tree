import type { Block, BoundingBox } from "../schemas/tree";

export interface ParsedDocument {
  blocks: Block[];
  rawContent: string;
}

interface ExtendBoundingBox {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
}

interface ExtendBlock {
  type: string;
  content: string;
  boundingBox?: ExtendBoundingBox;
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

function convertBoundingBox(bb?: ExtendBoundingBox): BoundingBox | null {
  if (!bb) return null;

  const x = bb.left ?? 0;
  const y = bb.top ?? 0;
  const width = bb.width ?? (bb.right !== undefined ? bb.right - x : 0);
  const height = bb.height ?? (bb.bottom !== undefined ? bb.bottom - y : 0);

  if (width === 0 && height === 0 && x === 0 && y === 0) {
    return null;
  }

  return { x, y, width, height };
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

  const blocks: Block[] = [];
  let blockIndex = 0;

  for (const chunk of data.chunks) {
    const pageNumber = chunk.metadata?.pageNumber ?? blockIndex + 1;

    for (const block of chunk.blocks) {
      blocks.push({
        id: `block-${blockIndex++}`,
        content: block.content,
        page: block.metadata?.pageNumber ?? pageNumber,
        type: block.type,
        boundingBox: convertBoundingBox(block.boundingBox),
      });
    }
  }

  const rawContent = blocks.map((b) => b.content).join("\n\n");

  return { blocks, rawContent };
}
