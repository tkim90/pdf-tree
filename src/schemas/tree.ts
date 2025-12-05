import { z } from "zod";

export const ChunkSchema = z.object({
  content: z.string(),
  page: z.number(),
});

export const HeadingSchema = z.object({
  heading: z.string(),
  level: z.number(),
  chunks: z.array(ChunkSchema),
});

export const SectionSchema = z.object({
  section: z.string(),
  chunks: z.array(ChunkSchema),
});

export const SemanticTreeSchema = z.object({
  title: z.string(),
  summary: z.string(),
  headings: z.array(HeadingSchema),
  sections: z.array(SectionSchema),
});

export type Chunk = z.infer<typeof ChunkSchema>;
export type Heading = z.infer<typeof HeadingSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type SemanticTree = z.infer<typeof SemanticTreeSchema>;
