import { NextResponse } from "next/server";

const lead = { type: "object", properties: {
  full_name: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, email: { type: "string", format: "email" }, phone: { type: "string", description: "E.164 preferred" },
  whatsapp: { type: "string" }, company_name: { type: "string" }, job_title: { type: "string" }, country: { type: "string" }, city: { type: "string" }, website: { type: "string" },
  industry: { type: "string" }, company_size: { type: "string", enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] }, services: { type: "array", items: { type: "string" } },
  estimated_budget: { type: "number" }, currency: { type: "string", enum: ["AED", "INR", "GBP", "USD", "EUR"] }, source: { type: "string", description: "Lead source name" }, source_id: { type: "string", format: "uuid" },
  campaign_id: { type: "string", format: "uuid" }, owner_id: { type: "string", format: "uuid", description: "Omit to apply the assignment rule" }, tags: { type: "array", items: { type: "string" } },
  notes: { type: "string" }, consent_status: { type: "string", enum: ["unknown", "granted", "denied", "unsubscribed"] }, allow_duplicate: { type: "boolean" } } };
const err = { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } } };

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "DigiFalx SalesOS API", version: "1.0.0", description: "Organisation-scoped REST API. Authenticate with `Authorization: Bearer <API key>` (Settings → API & webhooks). Rate limit: 120 requests/minute per key." },
    servers: [{ url: "/api/v1" }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, schemas: { LeadInput: lead, Error: err } },
    security: [{ bearer: [] }],
    paths: {
      "/leads": {
        get: { summary: "List leads", parameters: ["q", "status", "owner", "source_id", "created_from", "created_to", "page", "per_page", "sort"].map((n) => ({ name: n, in: "query", schema: { type: "string" } })),
          responses: { 200: { description: "Paginated leads (`data`, `meta`)" }, 401: { description: "Unauthenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } },
        post: { summary: "Create a lead (runs validation, duplicate check, scoring, assignment, first task, notification)",
          parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" }, description: "Replays the original response for 24 hours" }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LeadInput" } } } },
          responses: { 201: { description: "Created (`data.id`, `data.owner_id`)" }, 409: { description: "Possible duplicate" }, 422: { description: "Validation error" }, 429: { description: "Rate limited" } } },
      },
      "/leads/{id}": {
        get: { summary: "Get a lead", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { 200: { description: "Lead" }, 404: { description: "Not found" } } },
        patch: { summary: "Update a lead", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/LeadInput" } } } }, responses: { 200: { description: "Updated lead" } } },
      },
    },
    "x-roadmap": ["/contacts", "/companies", "/opportunities", "/activities", "/tasks", "/proposals", "/webhooks — Phase 2"],
  });
}
