import type { Tool } from "./types"
import semanticTree from "../../semantic-tree.json"

interface Block {
  id: string
  content: string
  page: number
  type: string
}

interface Heading {
  heading: string
  level: number
  blockIds: string[]
}

interface Section {
  section: string
  blockIds: string[]
}

interface SemanticTree {
  title: string
  summary: string
  blocks: Block[]
  headings: Heading[]
  sections: Section[]
}

const data = semanticTree as SemanticTree

const blockMap = new Map<string, Block>(
  data.blocks.map((b) => [b.id, b])
)

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
        blockIds: h.blockIds,
      })),
    })
  },
}

export const searchSections: Tool = {
  definition: {
    name: "search_sections",
    description:
      "Look up a specific section by its section number. Returns the block IDs associated with that section. Use section numbers like '1', '4.7', '15.2', etc.",
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
      blockIds: section.blockIds,
      blockCount: section.blockIds.length,
    })
  },
}

export const getBlocks: Tool = {
  definition: {
    name: "get_blocks",
    description:
      "Retrieve the actual text content for given block IDs. Use this after finding relevant block IDs from search_headings or search_sections.",
    parameters: {
      type: "object",
      properties: {
        block_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of block IDs to retrieve (e.g., ['block-289', 'block-378'])",
        },
      },
      required: ["block_ids"],
    },
  },
  execute: async (args) => {
    const blockIds = args.block_ids
    if (!Array.isArray(blockIds)) {
      return JSON.stringify({ error: "Missing required field: block_ids (must be an array)" })
    }

    const results: { id: string; content: string; page: number }[] = []
    const notFound: string[] = []

    for (const id of blockIds) {
      const block = blockMap.get(id)
      if (block) {
        results.push({
          id: block.id,
          content: block.content,
          page: block.page,
        })
      } else {
        notFound.push(id)
      }
    }

    return JSON.stringify({
      found: results.length,
      blocks: results,
      ...(notFound.length > 0 && { notFound }),
    })
  },
}

export const defaultTools: Tool[] = [searchHeadings, searchSections, getBlocks]
