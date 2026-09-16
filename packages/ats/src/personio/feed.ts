// Parses Personio's public XML feed ({company}.jobs.personio.de/xml) into plain records.
//
// Entity handling is done here, not by fast-xml-parser: its entity expansion limits are sized for
// hostile DOCTYPEs and a large feed full of "&amp;" could trip them. CDATA is kept apart
// (`#cdata`) so HTML inside CDATA is used as is, while escaped text is decoded once.
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { decodeHtmlEntities } from "../shared/text";

const CDATA = "#cdata";
const TEXT = "#text";

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  cdataPropName: CDATA,
  textNodeName: TEXT,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

/** A text node as fast-xml-parser leaves it: string, CDATA object, or absent. */
// `.optional()` before the transform: without it zod 4 treats a missing tag as an error.
const textNode = z
  .unknown()
  .optional()
  .transform((node) => textOf(node));

const listOf = <T extends z.ZodType>(item: T) =>
  z
    .unknown()
    .optional()
    .transform((v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]))
    .pipe(z.array(item));

const jobDescriptionSchema = z.object({ name: textNode, value: textNode });

const positionSchema = z.object({
  id: textNode.pipe(z.string().min(1)),
  name: textNode,
  subcompany: textNode,
  office: textNode,
  additionalOffices: z
    .object({ office: listOf(textNode) })
    .or(z.literal(""))
    .nullish()
    .transform((v) => (v && typeof v === "object" ? v.office.filter(isString) : [])),
  department: textNode,
  recruitingCategory: textNode,
  employmentType: textNode,
  seniority: textNode,
  schedule: textNode,
  createdAt: textNode,
  jobDescriptions: z
    .object({ jobDescription: listOf(jobDescriptionSchema) })
    .or(z.literal(""))
    .nullish()
    .transform((v) => (v && typeof v === "object" ? v.jobDescription : [])),
  salaryInformation: z
    .object({
      min: textNode,
      max: textNode,
      currencyCode: textNode,
      currencySymbol: textNode,
      type: textNode,
    })
    .or(z.literal(""))
    .nullish()
    .transform((v) => (v && typeof v === "object" ? v : null)),
});

const feedSchema = z.object({
  "workzag-jobs": z
    .object({ position: listOf(positionSchema) })
    .or(z.literal(""))
    .transform((v) => (typeof v === "object" ? v.position : [])),
});

export type PersonioPosition = z.infer<typeof positionSchema>;

export type ParseFeedResult =
  { ok: true; positions: PersonioPosition[] } | { ok: false; message: string; cause?: unknown };

export function parsePersonioFeed(xml: string): ParseFeedResult {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (cause) {
    return { ok: false, message: "body is not well-formed XML", cause };
  }
  const parsed = feedSchema.safeParse(doc);
  if (!parsed.success) {
    return {
      ok: false,
      message: `unexpected Personio feed shape: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      cause: parsed.error,
    };
  }
  return { ok: true, positions: parsed.data["workzag-jobs"] };
}

/**
 * Text of a node: CDATA content as is (it is raw HTML or text), plain text entity-decoded once.
 * Null when absent or blank.
 */
function textOf(node: unknown): string | null {
  let out: string;
  if (node === undefined || node === null) return null;
  if (typeof node === "string" || typeof node === "number") {
    out = decodeHtmlEntities(String(node));
  } else if (typeof node === "object" && !Array.isArray(node)) {
    // Mixed content: escaped text ("#text") and CDATA side by side.
    const record = node as Record<string, unknown>;
    const text = record[TEXT];
    const cdata = record[CDATA];
    if (text === undefined && cdata === undefined) return null;
    out =
      (text === undefined ? "" : decodeHtmlEntities(String(text))) +
      (Array.isArray(cdata) ? cdata.map(String).join("") : String(cdata ?? ""));
  } else {
    return null;
  }
  const trimmed = out.trim();
  return trimmed ? trimmed : null;
}

function isString(value: string | null): value is string {
  return value !== null;
}
