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
  blockIds: z.array(z.string()),
});

export const SectionSchema = z.object({
  section: z.string(),
  blockIds: z.array(z.string()),
});

export const SemanticTreeSchema = z.object({
  title: z.string(),
  summary: z.string(),
  blocks: z.array(BlockSchema),
  headings: z.array(HeadingSchema),
  sections: z.array(SectionSchema),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type Block = z.infer<typeof BlockSchema>;
export type Heading = z.infer<typeof HeadingSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type SemanticTree = z.infer<typeof SemanticTreeSchema>;
