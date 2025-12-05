import { parseWithExtend } from "../parsing/extend";
import {
  extractTitleAndSummary,
  extractHeadings,
  extractSections,
} from "../extraction/llm";
import type { SemanticTree } from "../schemas/tree";

export async function indexPdf(pdfUrl: string): Promise<SemanticTree> {
  console.log("Parsing PDF with Extend API...");
  const parsed = await parseWithExtend(pdfUrl);
  console.log(`Parsed ${parsed.chunks.length} chunks, ${parsed.blocks.length} blocks`);

  console.log("Extracting title and summary...");
  const { title, summary } = await extractTitleAndSummary(parsed);
  console.log(`Title: ${title}`);

  console.log("Extracting headings...");
  const headings = await extractHeadings(parsed.chunks);
  console.log(`Found ${headings.length} unique headings`);

  console.log("Extracting section references...");
  const sections = await extractSections(parsed.chunks);
  console.log(`Found ${sections.length} section references`);

  return {
    title,
    summary,
    chunks: parsed.chunks,
    blocks: parsed.blocks,
    headings,
    sections,
  };
}
