import { z } from "zod";
import type { BlogPostInput } from "./repository.js";

const trustedSourceDomains = [
  "mclaren.com",
  "ferrari.com",
  "lamborghini.com",
  "nhtsa.gov",
  "gov.uk",
  "europa.eu",
  "unece.org",
  "iso.org",
  "sae.org",
  "osha.gov",
  "boschaftermarket.com",
  "brembo.com",
  "zf.com",
];

function isTrustedSource(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return trustedSourceDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

const generatedArticleSchema = z.object({
  title: z.string().min(35).max(120),
  metaDescription: z.string().min(90).max(180),
  excerpt: z.string().min(100).max(360),
  category: z.string().min(3).max(80),
  brand: z.enum(["McLaren", "Ferrari", "Lamborghini", "Multi-brand"]),
  sourceQuery: z.string().min(5).max(300),
  sections: z.array(z.object({
    heading: z.string().min(5).max(140),
    paragraphs: z.array(z.string().min(80).max(900)).min(1).max(3),
    bullets: z.array(z.string().min(10).max(220)).max(6).optional(),
  })).min(3).max(6),
  sources: z.array(z.object({
    title: z.string().min(3).max(160),
    url: z.string().url().refine((value) => value.startsWith("https://") && isTrustedSource(value), "Source URL must use HTTPS and an approved primary or technical domain"),
  })).min(1).max(6),
});
const generatedArticleJsonSchema = z.toJSONSchema(generatedArticleSchema);
const prohibitedSeoTopicPatterns = [
  /\b(?:high[-\s]?voltage|hybrid safety|battery isolation|service disconnect|de-energ(?:ize|ise)|capacitor discharge)\b/i,
  /\b(?:airbag|srs|pyrotechnic|fuel system|fire suppression)\b/i,
  /\b(?:brake bleeding|vehicle lifting|jacking points?|lockout|tagout)\b/i,
];

export type GeneratedArticle = z.infer<typeof generatedArticleSchema>;

export function isSafeSeoTopic(value: string): boolean {
  return !prohibitedSeoTopicPatterns.some((pattern) => pattern.test(value));
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 170);
}

function messageTexts(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return [];
  return output.flatMap((item) => {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message" || !Array.isArray((item as { content?: unknown }).content)) return [];
    const text = ((item as { content: unknown[] }).content).flatMap((part) => {
      if (!part || typeof part !== "object" || (part as { type?: unknown }).type !== "output_text") return [];
      return typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : [];
    }).join("\n").trim();
    return text ? [text] : [];
  });
}

function extractOutputText(payload: unknown): string {
  const messages = messageTexts(payload);
  let fallback = "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = messages[index];
    if (!text) continue;
    if (!fallback) fallback = text;
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return text;
    } catch {
      // Web-search progress messages are expected; keep looking for the structured article.
    }
  }
  return fallback;
}

function parseGeneratedArticle(text: string): GeneratedArticle {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = generatedArticleSchema.parse(JSON.parse(cleaned));
  const combined = JSON.stringify(parsed).toLowerCase();
  const topic = `${parsed.title} ${parsed.category} ${parsed.sourceQuery}`.toLowerCase();
  const prohibited = [
    /\b\d+(?:\.\d+)?\s*(?:nm|n·m|lb-?ft|psi|bar|mm|°c|°f)\b/i,
    /(?:tighten|torque)\s+(?:to|at)\s+\d+/i,
    /disable\s+(?:the\s+)?(?:airbag|srs|safety)/i,
    /\b(?:disconnect|isolate|de-energ(?:ize|ise)|discharge|bleed|depressurize|disable)\b.{0,100}\b(?:battery|high[-\s]?voltage|airbag|srs|brake|fuel|hydraulic|pyrotechnic)\b/i,
    /\b(?:insulated gloves?|arc[-\s]?flash|personal protective equipment|\bppe\b)\b/i,
  ];
  if (!isSafeSeoTopic(topic) || prohibited.some((pattern) => pattern.test(combined))) {
    throw new Error("Generated article contains a prohibited technical specification or safety instruction");
  }
  return parsed;
}

export async function generateSeoArticle(options: {
  apiKey: string;
  existingTitles: string[];
  siteOrigin: string;
  signal?: AbortSignal;
}): Promise<BlogPostInput> {
  const instructions = `You are the editorial automation for Supercar Docs, an independent supercar workshop-information platform. Use web search to identify one current, useful, non-duplicate English topic for independent workshops or supercar owners researching service information. Prioritize documentation discovery, ownership research, service-record organisation, model identification, terminology, or non-technical workshop planning related to McLaren coverage today, or Ferrari/Lamborghini workshop planning without claiming unavailable manuals. Produce original educational content only. Never choose high-voltage, battery isolation, airbag, SRS, pyrotechnic, braking, fuel-system, fire-suppression, vehicle-lifting, PPE, or other safety-critical topics. Never copy a repair manual, never publish torque values, dimensions, fluid quantities, fault-code fixes, safety-critical step sequences, or claims that could cause unsafe repair. Never pretend Supercar Docs is affiliated with a manufacturer. Do not fabricate sources, customer quotes, statistics, or first-hand experience. Every source URL must use HTTPS and belong to one of these approved domains or its subdomains: ${trustedSourceDomains.join(", ")}. Return only valid JSON and no markdown.`;
  const input = `Public site: ${options.siteOrigin}\nExisting titles to avoid: ${options.existingTitles.join(" | ") || "none"}\nChoose the best search-informed topic and return this exact JSON shape: {"title":"...","metaDescription":"...","excerpt":"...","category":"...","brand":"McLaren|Ferrari|Lamborghini|Multi-brand","sourceQuery":"the search intent used","sections":[{"heading":"...","paragraphs":["..."],"bullets":["..."]}],"sources":[{"title":"...","url":"https://..."}]}. The title must be 45-80 characters, metaDescription 140-160 characters, and excerpt 140-220 characters. Use exactly 3 sections with exactly one 90-130 word paragraph per section, no more than 3 bullets total, and exactly 2 approved-domain sources. Keep the complete JSON under 800 words.`;
  const researchResponse = await fetch("https://api.deepseek.com/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      instructions: `Research one useful, current service-information topic for Supercar Docs. Use no more than two web searches. Use only HTTPS sources on these approved domains or their subdomains: ${trustedSourceDomains.join(", ")}. Choose a low-risk topic about documentation discovery, ownership research, service-record organisation, model identification, terminology, or non-technical workshop planning. Do not choose high-voltage, battery, airbag, braking, fuel-system, fire, lifting, PPE, repair-specification, diagnostic-fix, or other safety-critical subjects. Return a concise English research brief under 250 words with exactly two source titles and URLs.`,
      input: `Existing titles to avoid: ${options.existingTitles.join(" | ") || "none"}. Prefer a low-risk McLaren information-discovery topic today, or Ferrari/Lamborghini workshop planning without claiming unavailable manuals.`,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      reasoning: { effort: "none" },
      max_output_tokens: 1600,
      temperature: 0.2,
    }),
    signal: options.signal,
  });
  if (!researchResponse.ok) throw new Error(`DeepSeek research failed (${researchResponse.status})`);
  const researchPayload = await researchResponse.json();
  const research = messageTexts(researchPayload).sort((left, right) => right.length - left.length)[0]?.slice(0, 8_000) || "";
  if (!research) throw new Error("DeepSeek research returned no usable brief");

  const articleResponse = await fetch("https://api.deepseek.com/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      instructions,
      input: `${input}\nResearch brief:\n${research}`,
      reasoning: { effort: "none" },
      text: { format: { type: "json_schema", name: "seo_article", schema: generatedArticleJsonSchema } },
      max_output_tokens: 3000,
      temperature: 0.3,
    }),
    signal: options.signal,
  });
  if (!articleResponse.ok) throw new Error(`DeepSeek article generation failed (${articleResponse.status})`);
  const article = parseGeneratedArticle(extractOutputText(await articleResponse.json()));
  const slug = slugify(article.title);
  if (!slug) throw new Error("DeepSeek returned an unusable article title");
  return {
    slug,
    title: article.title,
    metaDescription: article.metaDescription,
    excerpt: article.excerpt,
    category: article.category,
    brand: article.brand,
    contentJson: JSON.stringify({ sections: article.sections, sources: article.sources }),
    sourceQuery: article.sourceQuery,
    status: "published",
    publishedAt: new Date().toISOString(),
  };
}
