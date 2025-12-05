import type { Tool } from "./types"
import semanticTree from "../../semantic-tree.json"

interface Chunk {
  id: string
  content: string
  pageStart: number
  pageEnd: number
  blockIds: string[]
}

interface Heading {
  heading: string
  level: number
  chunkIds: string[]
}

interface Section {
  section: string
  chunkIds: string[]
}

interface SemanticTree {
  title: string
  summary: string
  chunks: Chunk[]
  headings: Heading[]
  sections: Section[]
}

const data = semanticTree as unknown as SemanticTree

const chunkMap = new Map<string, Chunk>(
  data.chunks.map((c) => [c.id, c])
)

export const getDocSummary: Tool = {
  definition: {
    name: "get_doc_summary",
    description: "Get the document's title and summary. Use this first to understand what the document is about.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async () => {
    return JSON.stringify({
      title: data.title,
      summary: data.summary,
    })
  },
}

export const searchHeadings: Tool = {
  definition: {
    name: "search_headings",
    description:
      "Search through document headings/section titles for keywords. Use this first to find relevant sections. Returns matching headings with their section numbers and associated block IDs.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords to search for in headings (case-insensitive)",
        },
      },
      required: ["query"],
    },
  },
  execute: async (args) => {
    const query = args.query
    if (typeof query !== "string") {
      return JSON.stringify({ error: "Missing required field: query" })
    }

    // Extract section number if present (e.g., "section 16.1" → "16.1")
    const sectionMatch = query.match(/(?:section\s*)?(\d+(?:\.\d+)?)/i)
    const sectionNumber = sectionMatch?.[1]

    const searchTerms = query.toLowerCase()
      .replace(/^section\s*/i, '')
      .split(/\s+/)
      .filter(term => term.length > 0)
    
    const matches = data.headings.filter((h) => {
      const headingLower = h.heading.toLowerCase()
      
      // If query contains a section number, check if heading starts with it
      if (sectionNumber) {
        const sectionPattern = new RegExp(`^${sectionNumber.replace('.', '\\.')}[.:\\s]`, 'i')
        if (sectionPattern.test(h.heading)) {
          return true
        }
      }
      
      // Fall back to keyword matching
      return searchTerms.some((term) => headingLower.includes(term))
    })

    if (matches.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No headings found matching "${query}"`,
        suggestion: "Try different keywords or search for a specific section number",
      })
    }

    return JSON.stringify({
      found: true,
      count: matches.length,
      headings: matches.map((h) => ({
        heading: h.heading,
        level: h.level,
        chunkIds: h.chunkIds,
      })),
    })
  },
}

export const searchSections: Tool = {
  definition: {
    name: "search_sections",
    description:
      "Look up a specific section by its section number. Returns the chunk IDs associated with that section. Use section numbers like '1', '4.7', '15.2', etc.",
    parameters: {
      type: "object",
      properties: {
        section_number: {
          type: "string",
          description: "The section number to look up (e.g., '1', '4.7', '15.2')",
        },
      },
      required: ["section_number"],
    },
  },
  execute: async (args) => {
    const sectionNumber = args.section_number
    if (typeof sectionNumber !== "string") {
      return JSON.stringify({ error: "Missing required field: section_number" })
    }

    const section = data.sections.find(
      (s) => s.section === sectionNumber || s.section === sectionNumber.replace(/^Section\s*/i, "")
    )

    if (!section) {
      const availableSections = data.sections.map((s) => s.section).join(", ")
      return JSON.stringify({
        found: false,
        message: `Section "${sectionNumber}" not found`,
        availableSections,
      })
    }

    return JSON.stringify({
      found: true,
      section: section.section,
      chunkIds: section.chunkIds,
      chunkCount: section.chunkIds.length,
    })
  },
}

export const getChunks: Tool = {
  definition: {
    name: "get_chunks",
    description:
      "Retrieve the actual text content for given chunk IDs. Use this after finding relevant chunk IDs from search_headings or search_sections.",
    parameters: {
      type: "object",
      properties: {
        chunk_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of chunk IDs to retrieve (e.g., ['chunk-0', 'chunk-5'])",
        },
      },
      required: ["chunk_ids"],
    },
  },
  execute: async (args) => {
    const chunkIds = args.chunk_ids
    if (!Array.isArray(chunkIds)) {
      return JSON.stringify({ error: "Missing required field: chunk_ids (must be an array)" })
    }

    const results: { id: string; content: string; pageStart: number; pageEnd: number; blockIds: string[] }[] = []
    const notFound: string[] = []

    for (const id of chunkIds) {
      const chunk = chunkMap.get(id)
      if (chunk) {
        results.push({
          id: chunk.id,
          content: chunk.content,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          blockIds: chunk.blockIds,
        })
      } else {
        notFound.push(id)
      }
    }

    return JSON.stringify({
      found: results.length,
      chunks: results,
      ...(notFound.length > 0 && { notFound }),
    })
  },
}

export const defaultTools: Tool[] = [getDocSummary, searchHeadings, searchSections, getChunks]
