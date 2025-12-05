import type { Block, BoundingBox, Chunk } from "../schemas/tree";

export interface ParsedDocument {
  chunks: Chunk[];
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
        target: "markdown",
        chunkingStrategy: {
          type: "section",
          options: {
            minCharacters: 500,
            maxCharacters: 2000,
          },
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

  const chunks: Chunk[] = [];
  const blocks: Block[] = [];
  let blockIndex = 0;
  let chunkIndex = 0;

  for (const chunk of data.chunks) {
    const chunkBlockIds: string[] = [];
    let pageStart = Infinity;
    let pageEnd = 0;

    for (const block of chunk.blocks) {
      const blockId = `block-${blockIndex++}`;
      const pageNumber = block.metadata?.pageNumber ?? 1;

      chunkBlockIds.push(blockId);
      pageStart = Math.min(pageStart, pageNumber);
      pageEnd = Math.max(pageEnd, pageNumber);

      blocks.push({
        id: blockId,
        content: block.content,
        page: pageNumber,
        type: block.type,
        boundingBox: convertBoundingBox(block.boundingBox),
      });
    }

    chunks.push({
      id: `chunk-${chunkIndex++}`,
      content: chunk.content,
      pageStart: pageStart === Infinity ? 1 : pageStart,
      pageEnd: pageEnd === 0 ? 1 : pageEnd,
      blockIds: chunkBlockIds,
    });
  }

  const rawContent = chunks.map((c) => c.content).join("\n\n");

  return { chunks, blocks, rawContent };
}
