# pdf-tree

A semantic PDF retrieval system that parses PDFs into searchable chunks and provides an AI-powered agent for document Q&A with citations.

## Overview

pdf-tree takes a PDF document, extracts its content into semantically meaningful chunks using the [Extend API](https://extend.ai), builds a searchable index, and exposes a conversational REPL where you can ask questions about the document. The agent retrieves relevant chunks and provides answers with precise citations (chunk IDs and page numbers).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              PDF Document                               │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Extend Parse API                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  config:                                                         │   │
│  │    target: "markdown"                                            │   │
│  │    chunkingStrategy: { type: "section", min: 500, max: 2000 }   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Indexer                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Chunks     │  │   Headings   │  │   Sections   │                  │
│  │  (semantic)  │  │  (hierarchy) │  │  (numbered)  │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│         │                 │                 │                           │
│         └─────────────────┴─────────────────┘                           │
│                           │                                             │
│                           ▼                                             │
│                  semantic-tree.json                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Agent (GPT-4.1)                               │
│                                                                         │
│  Tools:                                                                 │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐              │
│  │ get_doc_summary│ │ search_headings│ │ search_sections│              │
│  └────────────────┘ └────────────────┘ └────────────────┘              │
│                           ┌────────────────┐                            │
│                           │   get_chunks   │                            │
│                           └────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              REPL                                       │
│                                                                         │
│  You: What does Section 15 say about liability?                         │
│  Agent: [Calling search_headings...]                                    │
│         [Calling search_sections...]                                    │
│         [Calling get_chunks...]                                         │
│         Section 15 covers limitation of liability...                    │
│         [chunk-42, pages 12-13]                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Model

```
semantic-tree.json
├── title: string              # Document title
├── summary: string            # AI-generated summary
├── chunks[]                   # Semantic chunks (500-2000 chars)
│   ├── id: string
│   ├── content: string        # Markdown content
│   ├── pageStart: number
│   ├── pageEnd: number
│   └── blockIds: string[]     # References to granular blocks
├── blocks[]                   # Raw extracted blocks
│   ├── id: string
│   ├── content: string
│   ├── page: number
│   ├── type: string
│   └── boundingBox: {...}
├── headings[]                 # Document structure
│   ├── heading: string
│   ├── level: number
│   └── chunkIds: string[]
└── sections[]                 # Numbered sections (e.g., "4.7")
    ├── section: string
    └── chunkIds: string[]
```

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set environment variables:
```bash
export EXTEND_API_KEY="your-extend-api-key"
export OPENAI_API_KEY="your-openai-api-key"
```

## Usage

### Index a PDF

```bash
bun run src/index.ts <pdf-url>
```

This parses the PDF, extracts semantic chunks, and writes `semantic-tree.json`.

### Query the Document

```bash
bun run index.ts
```

This starts the REPL. Available commands:
- Type a question to ask the agent
- `/debug` - Show chat history
- `/clear` - Clear chat history
- `/quit` - Exit

## How It Works

1. **Parsing**: The Extend API parses the PDF with section-based chunking, creating semantic chunks of 500-2000 characters that respect markdown structure (headings, paragraphs, tables).

2. **Indexing**: The indexer extracts:
   - Title and summary (via GPT-4.1)
   - Headings with hierarchy levels
   - Section references (e.g., "Section 4.7") mapped to chunks

3. **Retrieval**: The agent uses tools to:
   - Get document overview (`get_doc_summary`)
   - Search headings by keyword (`search_headings`)
   - Look up numbered sections (`search_sections`)
   - Retrieve chunk content (`get_chunks`)

4. **Answer Generation**: The agent synthesizes retrieved chunks into answers with citations pointing to specific chunks and page numbers.

## License

MIT
