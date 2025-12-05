import { z } from "zod";

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const BlockSchema = z.object({
  id: z.string(),
  content: z.string(),
  page: z.number(),
  type: z.string(),
  boundingBox: BoundingBoxSchema.nullable(),
});

export const HeadingSchema = z.object({
  heading: z.string(),
  level: z.number(),
  chunkIds: z.array(z.string()),
});

export const SectionSchema = z.object({
  section: z.string(),
  chunkIds: z.array(z.string()),
});

export const ChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  pageStart: z.number(),
  pageEnd: z.number(),
  blockIds: z.array(z.string()),
});

export const SemanticTreeSchema = z.object({
  title: z.string(),
  summary: z.string(),
  chunks: z.array(ChunkSchema),
  blocks: z.array(BlockSchema),
  headings: z.array(HeadingSchema),
  sections: z.array(SectionSchema),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type Heading = z.infer<typeof HeadingSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Chunk = z.infer<typeof ChunkSchema>;
export type SemanticTree = z.infer<typeof SemanticTreeSchema>;
