export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface PublicGuide {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  brand: string;
  publishedAt: string;
  reviewedAt: string;
  sections: GuideSection[];
}

export const evergreenGuides: PublicGuide[] = [
  {
    slug: "how-to-find-correct-mclaren-torque-settings",
    title: "How to Find the Correct McLaren Torque Settings",
    description: "A workshop-safe method for locating model-specific McLaren torque references without relying on an isolated value from a search result.",
    excerpt: "Learn why vehicle identity, component context, fastener condition, tightening stages, and the complete repair procedure all matter when locating a torque reference.",
    category: "Workshop specifications",
    brand: "McLaren",
    publishedAt: "2026-08-30T00:00:00.000Z",
    reviewedAt: "2026-08-30T00:00:00.000Z",
    sections: [
      {
        heading: "Start with the exact vehicle and procedure",
        paragraphs: [
          "A torque value is only useful when it belongs to the exact vehicle, component, fastener, and repair operation in front of the technician. Similar-looking assemblies can use different hardware, tightening stages, or replacement requirements.",
          "Use the vehicle identification details and the complete model-specific repair path before selecting a torque reference. A search snippet or a value copied from a related model does not provide enough context for safe workshop work.",
        ],
      },
      {
        heading: "Check the conditions attached to the value",
        paragraphs: ["The surrounding procedure may define whether a fastener is reusable, whether threads are dry or lubricated, and whether tightening includes an angle or staged sequence."],
        bullets: ["Confirm the exact component and fastener", "Check replacement-hardware requirements", "Look for staged or angle tightening", "Verify any preparation or lubrication instruction"],
      },
      {
        heading: "Keep the torque table connected to the repair document",
        paragraphs: ["Supercar Docs keeps protected torque references close to their related repair information so members can verify the context. This public preview intentionally contains no vehicle specification or proprietary procedure."],
      },
    ],
  },
  {
    slug: "mclaren-door-latch-diagnostic-workflow",
    title: "McLaren Door Latch Concern: A Better Diagnostic Workflow",
    description: "An original diagnostic overview for separating mechanical, electrical, alignment, and control concerns before opening a protected vehicle procedure.",
    excerpt: "Use a structured first-pass assessment to avoid replacing a latch before checking alignment, releases, wiring, control inputs, and related door hardware.",
    category: "Body systems",
    brand: "McLaren",
    publishedAt: "2026-08-30T00:00:00.000Z",
    reviewedAt: "2026-08-30T00:00:00.000Z",
    sections: [
      {
        heading: "Separate the symptom before removing parts",
        paragraphs: ["Record when the concern appears and whether it affects the mechanical latch, powered release, emergency release, locking state, or door alignment. A precise symptom description narrows the document path and avoids unnecessary disassembly."],
      },
      {
        heading: "Check related systems as one workflow",
        paragraphs: ["Door concerns can cross mechanical hardware, wiring, electronic control, glazing, sealing, and body alignment. A useful diagnosis checks these relationships before treating the latch as an isolated component."],
        bullets: ["Confirm the symptom and operating conditions", "Inspect visible alignment and interference", "Verify mechanical and emergency releases", "Check relevant power, wiring, and control information", "Open the exact model procedure before removal"],
      },
      {
        heading: "Use the complete protected procedure for repair",
        paragraphs: ["The member library provides model-specific navigation to the associated documents. This public page is an original overview, not a substitute for current manufacturer information, scan data, safety procedures, or qualified diagnosis."],
      },
    ],
  },
  {
    slug: "mclaren-front-brake-service-information-checklist",
    title: "McLaren Front Brake Service Information Checklist",
    description: "What an independent workshop should identify before beginning model-specific McLaren front brake work.",
    excerpt: "A practical pre-work checklist covering vehicle identity, lifting, brake-system variant, component inspection, consumables, and linked technical references.",
    category: "Braking systems",
    brand: "McLaren",
    publishedAt: "2026-08-30T00:00:00.000Z",
    reviewedAt: "2026-08-30T00:00:00.000Z",
    sections: [
      {
        heading: "Identify the vehicle and brake configuration",
        paragraphs: ["Confirm the exact model, model year or applicable production information, and fitted brake-system variant. Do not assume that a procedure or component specification transfers between visually similar vehicles."],
      },
      {
        heading: "Prepare the information before the vehicle is lifted",
        paragraphs: ["Locate the approved lifting information, complete repair procedure, inspection criteria, consumable requirements, and connected torque references before work begins."],
        bullets: ["Vehicle and brake-system identity", "Approved lifting and support information", "Component condition and replacement criteria", "Required consumables and replacement hardware", "Complete tightening and post-work checks"],
      },
      {
        heading: "Treat this as a preview, not a repair instruction",
        paragraphs: ["No torque values, wear limits, bleeding sequence, or proprietary procedure is published here. Qualified technicians should use current vehicle-specific information and remain responsible for all safety-critical decisions."],
      },
    ],
  },
];

export function findEvergreenGuide(slug: string): PublicGuide | undefined {
  return evergreenGuides.find((guide) => guide.slug === slug);
}
