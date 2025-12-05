import OpenAI from "openai";
import { groupBy, mapValues } from "remeda";
import type { Block, Heading, Section } from "../schemas/tree";
import type { ParsedDocument } from "../parsing/extend";

const openai = new OpenAI();

const SECTION_PATTERNS = [
  /Section\s+(\d+(?:\.\d+)*)/gi,
  /Section\s+([A-Z](?:\.\d+)*)/gi,
  /§\s*(\d+(?:\.\d+)*(?:\([a-z0-9]+\))*)/gi,
  /Article\s+(\d+)/gi,
];

function getBlocksByPage(blocks: Block[]): Map<number, Block[]> {
  const pageMap = new Map<number, Block[]>();
  for (const block of blocks) {
    const existing = pageMap.get(block.page) ?? [];
    existing.push(block);
    pageMap.set(block.page, existing);
  }
  return pageMap;
}

export async function extractTitleAndSummary(
  doc: ParsedDocument
): Promise<{ title: string; summary: string }> {
  const truncatedContent = doc.rawContent.slice(0, 15000);

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content: `You are a document analysis assistant. Extract the document title and provide a summary.
Return JSON in this exact format:
{
  "title": "Document Title",
  "summary": "Up to 5 sentence summary of the document's main content and purpose."
}`,
      },
      {
        role: "user",
        content: `Analyze this document and extract the title and summary:\n\n${truncatedContent}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  return JSON.parse(content) as { title: string; summary: string };
}

export async function extractHeadings(doc: ParsedDocument): Promise<Heading[]> {
  const pageBlocks = getBlocksByPage(doc.blocks);
  const pages = Array.from(pageBlocks.entries());

  const pagePromises = pages.map(async ([pageNum, blocks]) => {
    const pageContent = blocks.map((b) => b.content).join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are a document structure analyzer. Extract all headings from the text with their hierarchy level.
Return JSON in this exact format:
{
  "headings": [
    { "heading": "1. Introduction", "level": 1 },
    { "heading": "1.1 Background", "level": 2 }
  ]
}
Level 1 is the top-most heading level, level 2 is a subheading, etc.
Only include actual headings/section titles, not regular paragraph text.
If no headings are found, return {"headings": []}`,
        },
        {
          role: "user",
          content: `Extract headings from this page content:\n\n${pageContent}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as {
      headings: Array<{ heading: string; level: number }>;
    };

    return parsed.headings.map((h) => {
      const matchingBlock = blocks.find(
        (b) => b.type === "heading" || b.content.includes(h.heading)
      );
      return {
        ...h,
        blockId: matchingBlock?.id ?? blocks[0]?.id ?? `page-${pageNum}`,
      };
    });
  });

  const allHeadings = (await Promise.all(pagePromises)).flat();

  const grouped = groupBy(allHeadings, (h) => h.heading);
  const headingMap = mapValues(grouped, (group) => ({
    heading: group[0]!.heading,
    level: group[0]!.level,
    blockIds: group.map((h) => h.blockId),
  }));

  return Object.values(headingMap);
}

export async function extractSections(doc: ParsedDocument): Promise<Section[]> {
  const sectionIdentifiers = new Set<string>();

  for (const block of doc.blocks) {
    for (const pattern of SECTION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(block.content)) !== null) {
        const identifier = match[1];
        if (identifier) {
          sectionIdentifiers.add(identifier);
        }
      }
    }
  }

  const sections: Section[] = [];

  for (const identifier of sectionIdentifiers) {
    const escapedId = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchPattern = new RegExp(`\\b${escapedId}\\b`, "i");

    const matchingBlockIds: string[] = [];
    for (const block of doc.blocks) {
      if (searchPattern.test(block.content)) {
        matchingBlockIds.push(block.id);
      }
    }

    if (matchingBlockIds.length > 0) {
      sections.push({
        section: identifier,
        blockIds: matchingBlockIds,
      });
    }
  }

  sections.sort((a, b) => {
    const aParts = a.section.split(".").map((p) => parseInt(p) || p);
    const bParts = b.section.split(".").map((p) => parseInt(p) || p);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] ?? 0;
      const bVal = bParts[i] ?? 0;
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  });

  return sections;
}
