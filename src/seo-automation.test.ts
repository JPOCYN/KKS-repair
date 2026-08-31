import assert from "node:assert/strict";
import test from "node:test";
import { generateSeoArticle } from "./seo-automation.js";

test("selects the structured article among DeepSeek web-search progress messages", async () => {
  const originalFetch = globalThis.fetch;
  const title = "How McLaren Owners Can Verify Official Service Information";
  const paragraph = "Independent workshops should identify the exact vehicle and consult current official service information before planning work. This avoids relying on assumptions, copied specifications, or instructions that may belong to a different model year or configuration.";
  globalThis.fetch = async () => new Response(JSON.stringify({
    output: [
      { type: "message", content: [{ type: "output_text", text: "I will research approved sources first." }] },
      { type: "web_search_call", status: "completed" },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({
        title,
        metaDescription: "Learn how to identify reliable McLaren service information, verify vehicle details, and prepare safer workshop research without publishing protected specifications.",
        excerpt: "A practical overview for locating authoritative McLaren service information, checking vehicle context, and separating planning guidance from protected repair specifications.",
        category: "Workshop planning",
        brand: "McLaren",
        sourceQuery: "official McLaren service information workshop planning",
        sections: [
          { heading: "Confirm the vehicle context", paragraphs: [paragraph] },
          { heading: "Use authoritative information", paragraphs: [paragraph] },
          { heading: "Plan before workshop work", paragraphs: [paragraph] },
        ],
        sources: [
          { title: "McLaren Automotive", url: "https://cars.mclaren.com/" },
          { title: "NHTSA", url: "https://www.nhtsa.gov/vehicle" },
        ],
      }) }] },
      { type: "message", content: [{ type: "output_text", text: "I now have enough approved sources to complete the answer." }] },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const article = await generateSeoArticle({ apiKey: "test-key", existingTitles: [], siteOrigin: "https://supercardocs.com" });
    assert.equal(article.title, title);
    assert.equal(article.slug, "how-mclaren-owners-can-verify-official-service-information");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
