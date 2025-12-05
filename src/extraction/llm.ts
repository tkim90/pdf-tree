import OpenAI from "openai";
import { groupBy, mapValues } from "remeda";
import type { Chunk, Heading, Section } from "../schemas/tree";
import type { ParsedDocument } from "../parsing/extend";

const openai = new OpenAI();

const SECTION_PATTERNS = [
  /Section\s+(\d+(?:\.\d+)*)/gi,
  /Section\s+([A-Z](?:\.\d+)*)/gi,
  /§\s*(\d+(?:\.\d+)*(?:\([a-z0-9]+\))*)/gi,
  /Article\s+(\d+)/gi,
];

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
  const chunkPromises = doc.chunks.map(async (chunk) => {
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
          content: `Extract headings from this page content:\n\n${chunk.content}`,
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

    return parsed.headings.map((h) => ({
      ...h,
      page: chunk.page,
    }));
  });

  const allHeadings = (await Promise.all(chunkPromises)).flat();

  const grouped = groupBy(allHeadings, (h) => h.heading);
  const headingMap = mapValues(grouped, (group) => ({
    heading: group[0]!.heading,
    level: group[0]!.level,
    chunks: group.map((h) => ({
      content: h.heading,
      page: h.page,
    })),
  }));

  return Object.values(headingMap);
}

export async function extractSections(doc: ParsedDocument): Promise<Section[]> {
  const sectionMap = new Map<string, Chunk[]>();

  for (const chunk of doc.chunks) {
    for (const pattern of SECTION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(chunk.content)) !== null) {
        const fullMatch = match[0];
        const existing = sectionMap.get(fullMatch) ?? [];
        const alreadyHasPage = existing.some((c) => c.page === chunk.page);
        if (!alreadyHasPage) {
          existing.push({
            content: chunk.content,
            page: chunk.page,
          });
          sectionMap.set(fullMatch, existing);
        }
      }
    }
  }

  return Array.from(sectionMap.entries()).map(([section, chunks]) => ({
    section,
    chunks,
  }));
}
