import { indexPdf } from "./pipeline/indexer";
import { SemanticTreeSchema } from "./schemas/tree";

async function main() {
  const pdfUrl = process.argv[2];

  if (!pdfUrl) {
    console.error("Usage: bun run src/index.ts <pdf-url>");
    console.error(
      "Example: bun run src/index.ts https://example.com/document.pdf"
    );
    process.exit(1);
  }

  try {
    const tree = await indexPdf(pdfUrl);

    const validated = SemanticTreeSchema.parse(tree);

    const outputPath = "semantic-tree.json";
    await Bun.write(outputPath, JSON.stringify(validated, null, 2));
    console.log(`\nOutput written to ${outputPath}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
