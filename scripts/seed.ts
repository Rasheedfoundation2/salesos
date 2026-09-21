/* Seeds realistic DigiFalx demo data through the real service layer (RLS enforced). Run: npm run db:seed */
import "dotenv/config";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { withSystem, withTenant } from "@/lib/db";
import type { Ctx, Role } from "@/lib/types";
import { createOrganisation } from "@/lib/services/auth";
import { createLead, convertLead, updateLead } from "@/lib/services/leads";
import { createOpportunity, moveStage, updateOpportunity } from "@/lib/services/opportunities";
import { logActivity, saveTask } from "@/lib/services/activities";
import { saveCompany, saveContact } from "@/lib/services/accounts";

const PASSWORD = process.env.SEED_PASSWORD ?? "DigiFalx@2026";
const days = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();
const date = (n: number) => days(n).slice(0, 10);

async function main() {
  const admin = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await admin.connect();
  const exists = await admin.query("select 1 from organisations where slug = 'digifalx'");
  if (exists.rowCount) { console.log("Seed data already present — run npm run db:reset first to reseed."); await admin.end(); return; }
  const hash = await bcrypt.hash(PASSWORD, 12);

  const people: { key: string; name: string; email: string; role: Role; title: string; target?: number; countries?: string[]; discount?: number }[] = [
    { key: "rasheed", name: "Rasheed Shaikh", email: "rasheed@digifalx.com", role: "owner", title: "Founder" },
    { key: "aisha", name: "Aisha Khan", email: "aisha@digifalx.com", role: "manager", title: "Sales Manager", target: 150000, discount: 20 },
    { key: "omar", name: "Omar Farooq", email: "omar@digifalx.com", role: "rep", title: "Sales Representative — UAE & GCC", target: 80000, countries: ["United Arab Emirates", "Saudi Arabia"], discount: 10 },
    { key: "priya", name: "Priya Nair", email: "priya@digifalx.com", role: "rep", title: "Sales Representative — India & UK", target: 60000, countries: ["India", "United Kingdom"], discount: 10 },
    { key: "sara", name: "Sara Mathews", email: "sara@digifalx.com", role: "marketing", title: "Marketing Lead" },
    { key: "daniel", name: "Daniel Brooks", email: "daniel@digifalx.com", role: "finance", title: "Finance Controller" },
  ];
  const ids: Record<string, string> = {};
  for (const p of people) {
    const r = await admin.query("insert into users(email, name, password_hash, is_platform_admin) values ($1,$2,$3,$4) returning id", [p.email, p.name, hash, false]);
    ids[p.key] = r.rows[0].id;
  }
  const platform = await admin.query("insert into users(email, name, password_hash, is_platform_admin) values ('platform@salesos.app','Platform Admin',$1,true) returning id", [hash]);
  await admin.end();

  const orgId = await withSystem((db) => createOrganisation(db, ids.rasheed!, "DigiFalx", "AED"));
  await withSystem(async (db) => {
    await db.exec("update organisations set plan_code = 'professional', settings = settings || '{\"high_value_threshold\": 75000}' where id = $1", [orgId]);
    const t2 = await db.one<{ id: string }>("insert into teams(org_id, name) values ($1,'Marketing') returning id", [orgId]);
    const sales = await db.one<{ id: string }>("select id from teams where org_id = $1 and name = 'Sales'", [orgId]);
    for (const p of people.slice(1)) {
      await db.exec(`insert into memberships(org_id, user_id, role, team_id, title, monthly_target, countries, max_discount_pct, accepts_leads)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [orgId, ids[p.key], p.role, p.role === "marketing" ? t2!.id : sales!.id, p.title, p.target ?? null, p.countries ?? [], p.discount ?? 0, p.role === "rep"]);
    }
    await db.exec("update memberships set title = 'Founder' where org_id = $1 and user_id = $2", [orgId, ids.rasheed]);
    // Campaigns & products
    const src = async (n: string) => (await db.one<{ id: string }>("select id from lead_sources where org_id = $1 and name = $2", [orgId, n]))!.id;
    for (const [name, s, budget] of [["Q3 Dubai Real Estate Push", "Meta Lead Ads", 25000], ["UK SME SEO Webinar", "Events", 8000], ["India D2C Growth Audit", "Google Ads", 12000], ["LinkedIn Founder Outreach", "LinkedIn", 5000]] as const)
      await db.exec("insert into campaigns(org_id, name, source_id, budget, currency, starts_on) values ($1,$2,$3,$4,'AED', current_date - 60)", [orgId, name, await src(s), budget]);
    for (const [name, cat, bt, price] of [["Performance Marketing Retainer", "Marketing", "monthly", 12000], ["SEO Retainer", "Marketing", "monthly", 6500], ["WordPress Website Build", "Web", "one_time", 28000],
      ["Shopify / WooCommerce Store", "Web", "one_time", 35000], ["CRM / ERP Implementation", "Technology", "one_time", 60000], ["AI Automation Package", "Technology", "one_time", 40000],
      ["Social Media Management", "Marketing", "monthly", 8000], ["Market Research Study", "Research", "one_time", 18000]] as const)
      await db.exec("insert into products(org_id, name, category, billing_type, unit_price, currency) values ($1,$2,$3,$4,$5,'AED')", [orgId, name, cat, bt, price]);
    // Second pipeline for real-estate style deals
    const p2 = await db.one<{ id: string }>("insert into pipelines(org_id, name) values ($1,'Enterprise & Retainers') returning id", [orgId]);
    let pos = 0;
    for (const [n, pr, c, k] of [["Discovery", 20, "#3b82f6", "open"], ["Solution Design", 40, "#6366f1", "open"], ["Proposal", 60, "#a855f7", "open"], ["Procurement", 80, "#f59e0b", "open"], ["Signed", 100, "#16a34a", "won"], ["Lost", 0, "#dc2626", "lost"]] as const)
      await db.exec("insert into pipeline_stages(org_id, pipeline_id, name, position, probability, color, kind) values ($1,$2,$3,$4,$5,$6,$7)", [orgId, p2!.id, n, pos++, pr, c, k]);
  });

  const ctxFor = async (key: string): Promise<Ctx> => {
    const org = await withSystem((db) => db.one<Ctx["org"]>("select id, name, slug, currency, timezone, date_format, plan_code, status, settings, terminology from organisations where id = $1", [orgId]));
    const role = people.find((p) => p.key === key)!.role;
    return { userId: ids[key]!, orgId, role, sessionId: "seed", teamId: null, user: { id: ids[key]!, name: key, email: "", is_platform_admin: false, must_change_password: false }, org: org! };
  };
  const rasheed = await ctxFor("rasheed"), aisha = await ctxFor("aisha"), omar = await ctxFor("omar"), priya = await ctxFor("priya"), sara = await ctxFor("sara");
  const lk = await withTenant(rasheed, async (db) => ({
    src: Object.fromEntries((await db.many<{ id: string; name: string }>("select id, name from lead_sources where org_id = $1", [orgId])).map((r) => [r.name, r.id])),
    camp: Object.fromEntries((await db.many<{ id: string; name: string }>("select id, name from campaigns where org_id = $1", [orgId])).map((r) => [r.name, r.id])),
    pipe: (await db.one<{ id: string }>("select id from pipelines where org_id = $1 and is_default", [orgId]))!.id,
    pipe2: (await db.one<{ id: string }>("select id from pipelines where org_id = $1 and not is_default", [orgId]))!.id,
    stages: Object.fromEntries((await db.many<{ id: string; name: string; pipeline_id: string }>("select id, name, pipeline_id from pipeline_stages where org_id = $1", [orgId])).map((r) => [`${r.pipeline_id}:${r.name}`, r.id])),
  }));
  const stage = (name: string, p = lk.pipe) => lk.stages[`${p}:${name}`]!;

  // ── Companies (10) ──
  const companies = [
    { key: "emaar", name: "Palm Crest Properties", website: "https://palmcrest.ae", industry: "Real Estate", company_size: "201-500", country: "United Arab Emirates", city: "Dubai", owner: omar },
    { key: "desert", name: "Desert Rose Hospitality", website: "https://desertrosehotels.ae", industry: "Hospitality", company_size: "501-1000", country: "United Arab Emirates", city: "Abu Dhabi", owner: omar },
    { key: "marina", name: "Marina Events Co.", website: "https://marinaevents.ae", industry: "Events", company_size: "51-200", country: "United Arab Emirates", city: "Dubai", owner: omar },
    { key: "falcon", name: "Falcon Logistics LLC", website: "https://falconlogistics.ae", industry: "Logistics", company_size: "201-500", country: "United Arab Emirates", city: "Sharjah", owner: aisha },
    { key: "thames", name: "Thames Valley Dental Group", website: "https://tvdental.co.uk", industry: "Healthcare", company_size: "51-200", country: "United Kingdom", city: "Reading", owner: priya },
    { key: "kensington", name: "Kensington Legal LLP", website: "https://kensingtonlegal.co.uk", industry: "Professional Services", company_size: "11-50", country: "United Kingdom", city: "London", owner: priya },
    { key: "brightcart", name: "BrightCart Retail", website: "https://brightcart.in", industry: "E-commerce", company_size: "51-200", country: "India", city: "Mumbai", owner: priya },
    { key: "vedanta", name: "Vedanta EdTech", website: "https://vedantaedtech.in", industry: "Education", company_size: "201-500", country: "India", city: "Bengaluru", owner: priya },
    { key: "saffron", name: "Saffron Foods Pvt Ltd", website: "https://saffronfoods.in", industry: "Retail", company_size: "501-1000", country: "India", city: "Pune", owner: aisha },
    { key: "gulfbuild", name: "GulfBuild Contracting", website: "https://gulfbuild.ae", industry: "Construction", company_size: "1000+", country: "United Arab Emirates", city: "Dubai", owner: aisha },
  ];
  const co: Record<string, string> = {};
  for (const c of companies) co[c.key] = await saveCompany(c.owner, null, { name: c.name, website: c.website, industry: c.industry, company_size: c.company_size, country: c.country, city: c.city });

  // ── Contacts (15) ──
  const contacts = [
    ["emaar", "Khalid", "Al Mansoori", "Head of Marketing", "khalid@palmcrest.ae", "+971501234501", "decision_maker", omar], ["emaar", "Leila", "Haddad", "Digital Manager", "leila@palmcrest.ae", "+971501234502", "influencer", omar],
    ["desert", "Fatima", "Al Zaabi", "Director of Sales & Marketing", "fatima@desertrosehotels.ae", "+971502345601", "decision_maker", omar],
    ["marina", "James", "O'Connor", "Managing Director", "james@marinaevents.ae", "+971503456701", "decision_maker", omar], ["marina", "Nadia", "Rahman", "Events Marketing Lead", "nadia@marinaevents.ae", "+971503456702", "champion", omar],
    ["falcon", "Rashid", "Qureshi", "COO", "rashid@falconlogistics.ae", "+971504567801", "decision_maker", aisha],
    ["thames", "Emily", "Clarke", "Practice Director", "emily@tvdental.co.uk", "+447700900101", "decision_maker", priya], ["thames", "Tom", "Walker", "Operations Manager", "tom@tvdental.co.uk", "+447700900102", "influencer", priya],
    ["kensington", "Oliver", "Grant", "Senior Partner", "oliver@kensingtonlegal.co.uk", "+447700900201", "decision_maker", priya],
    ["brightcart", "Ananya", "Sharma", "Founder & CEO", "ananya@brightcart.in", "+919820012301", "decision_maker", priya], ["brightcart", "Rohit", "Mehta", "Growth Manager", "rohit@brightcart.in", "+919820012302", "champion", priya],
    ["vedanta", "Vikram", "Iyer", "CMO", "vikram@vedantaedtech.in", "+919845012401", "decision_maker", priya],
    ["saffron", "Meera", "Kulkarni", "Head of E-commerce", "meera@saffronfoods.in", "+919822012501", "decision_maker", aisha],
    ["gulfbuild", "Hassan", "Al Suwaidi", "CEO", "hassan@gulfbuild.ae", "+971505678901", "decision_maker", aisha], ["gulfbuild", "Sophie", "Martin", "Procurement Manager", "sophie@gulfbuild.ae", "+971505678902", "gatekeeper", aisha],
  ] as const;
  const ct: Record<string, string> = {};
  for (const [c, fn, ln, title, email, phone, role, owner] of contacts)
    ct[email] = await saveContact(owner, null, { company_id: co[c], first_name: fn, last_name: ln, job_title: title, email, phone, decision_role: role, consent_status: "granted", country: companies.find((x) => x.key === c)!.country });

  // ── Opportunities (12) ──
  type O = { name: string; c: string; contact: string; owner: Ctx; value: number; cur: string; stage: string; close: number; services: string[]; source: string; pipe?: string; lost?: string; next?: string; risk?: string; wonAgo?: number };
  const opps: O[] = [
    { name: "Palm Crest — Off-plan Launch Campaign", c: "emaar", contact: "khalid@palmcrest.ae", owner: omar, value: 180000, cur: "AED", stage: "Negotiation", close: 12, services: ["Performance Marketing", "Content Production"], source: "Meta Lead Ads", next: "Send revised media plan" },
    { name: "Desert Rose — Direct Booking SEO", c: "desert", contact: "fatima@desertrosehotels.ae", owner: omar, value: 78000, cur: "AED", stage: "Proposal Sent", close: 20, services: ["SEO"], source: "Referral", next: "Follow up on proposal" },
    { name: "Marina Events — Festival Ticketing Site", c: "marina", contact: "james@marinaevents.ae", owner: omar, value: 42000, cur: "AED", stage: "Closed Won", close: -5, services: ["Website Development"], source: "Events", wonAgo: 5 },
    { name: "Falcon Logistics — CRM Implementation", c: "falcon", contact: "rashid@falconlogistics.ae", owner: aisha, value: 95000, cur: "AED", stage: "Discovery Scheduled", close: 45, services: ["CRM / ERP", "AI Automation"], source: "LinkedIn", next: "Discovery workshop", risk: "medium" },
    { name: "Thames Valley Dental — Patient Acquisition", c: "thames", contact: "emily@tvdental.co.uk", owner: priya, value: 24000, cur: "GBP", stage: "Verbal Confirmation", close: 7, services: ["Performance Marketing", "SEO"], source: "Events", next: "Contract signature" },
    { name: "Kensington Legal — Website Rebuild", c: "kensington", contact: "oliver@kensingtonlegal.co.uk", owner: priya, value: 18000, cur: "GBP", stage: "Closed Lost", close: -10, services: ["Website Development"], source: "Google Ads", lost: "Competitor selected" },
    { name: "BrightCart — D2C Growth Retainer", c: "brightcart", contact: "ananya@brightcart.in", owner: priya, value: 1800000, cur: "INR", stage: "Closed Won", close: -60, services: ["Performance Marketing", "E-commerce"], source: "Google Ads", wonAgo: 60 },
    { name: "Vedanta EdTech — Admissions Funnel", c: "vedanta", contact: "vikram@vedantaedtech.in", owner: priya, value: 2400000, cur: "INR", stage: "Requirement Confirmed", close: 30, services: ["Performance Marketing", "AI Automation"], source: "LinkedIn", next: "Scope sign-off" },
    { name: "Saffron Foods — Shopify Migration", c: "saffron", contact: "meera@saffronfoods.in", owner: aisha, value: 3200000, cur: "INR", stage: "Solution Design", close: 50, services: ["E-commerce", "Website Development"], source: "Referral", pipe: "pipe2", next: "Architecture review" },
    { name: "GulfBuild — Group Brand & Digital", c: "gulfbuild", contact: "hassan@gulfbuild.ae", owner: aisha, value: 260000, cur: "AED", stage: "Procurement", close: 21, services: ["Branding", "Website Development", "Social Media"], source: "Cold outreach", pipe: "pipe2", next: "Vendor registration docs", risk: "high" },
    { name: "Desert Rose — Social Media Q4", c: "desert", contact: "fatima@desertrosehotels.ae", owner: omar, value: 36000, cur: "AED", stage: "Closed Won", close: -110, services: ["Social Media"], source: "Referral", wonAgo: 110 },
    { name: "Marina Events — Sponsorship Research", c: "marina", contact: "nadia@marinaevents.ae", owner: omar, value: 22000, cur: "AED", stage: "Closed Lost", close: -40, services: ["Market Research"], source: "Events", lost: "No budget" },
  ];
  const oppIds: string[] = [];
  for (const o of opps) {
    const pipe = o.pipe === "pipe2" ? lk.pipe2 : lk.pipe;
    const first = o.pipe === "pipe2" ? stage("Discovery", pipe) : stage("Qualified", pipe);
    const id = await createOpportunity(o.owner, { name: o.name, company_id: co[o.c], contact_id: ct[o.contact], pipeline_id: pipe, stage_id: first, value: o.value, currency: o.cur,
      expected_close_date: date(o.close), services: o.services, source_id: lk.src[o.source], next_action: o.next ?? null, next_action_date: o.next ? date(3) : null, risk_level: o.risk ?? "low" });
    oppIds.push(id);
    await logActivity(o.owner, { type: "call", subject: "Discovery call", body: "Discussed goals, current channels and budget range.", outcome: "Connected — interested", opportunity_id: id, duration_min: 30, occurred_at: days(-Math.max(5, (o.wonAgo ?? 10) + 5)) });
    const target = stage(o.stage, pipe);
    if (target !== first) await moveStage(o.stage.startsWith("Closed") ? aisha : o.owner, id, { stage_id: target, lost_reason: o.lost ?? null, lost_notes: o.lost ? "Captured in win/loss review." : null });
  }

  // ── Leads (25) ──
  const L = (full_name: string, company_name: string, email: string, phone: string, country: string, city: string, job_title: string, industry: string, company_size: string, services: string[], source: string, extra: Record<string, unknown> = {}) =>
    ({ full_name, company_name, email, phone, country, city, job_title, industry, company_size, services, source_id: lk.src[source], ...extra });
  const leadRows = [
    L("Mohammed Al Hashimi", "Azure Bay Developments", "mohammed@azurebay.ae", "+971521112201", "United Arab Emirates", "Dubai", "CEO", "Real Estate", "51-200", ["Performance Marketing", "Content Production"], "Meta Lead Ads", { campaign_id: lk.camp["Q3 Dubai Real Estate Push"], estimated_budget: 60000, timeframe: "0-3 months", website: "https://azurebay.ae" }),
    L("Noura Al Ketbi", "Oasis Living Realty", "noura@oasisliving.ae", "+971521112202", "United Arab Emirates", "Abu Dhabi", "Marketing Director", "Real Estate", "11-50", ["Performance Marketing"], "Meta Lead Ads", { campaign_id: lk.camp["Q3 Dubai Real Estate Push"], estimated_budget: 25000, timeframe: "3-6 months" }),
    L("Arjun Kapoor", "UrbanNest Homes", "arjun@urbannest.ae", "+971521112203", "United Arab Emirates", "Dubai", "Sales Manager", "Real Estate", "11-50", ["Website Development"], "Meta Lead Ads", { campaign_id: lk.camp["Q3 Dubai Real Estate Push"], estimated_budget: 15000 }),
    L("Hamdan Al Falasi", "Skyline Tower Brokers", "hamdan@skylinebrokers.ae", "+971521112204", "United Arab Emirates", "Dubai", "Founder", "Real Estate", "11-50", ["Performance Marketing", "CRM / ERP"], "Website form", { estimated_budget: 45000, timeframe: "immediate", website: "https://skylinebrokers.ae", linkedin_url: "https://linkedin.com/company/skyline" }),
    L("Grace Thompson", "Northwind Accountants", "grace@northwind-acc.co.uk", "+447700900301", "United Kingdom", "Manchester", "Managing Partner", "Professional Services", "11-50", ["SEO", "Website Development"], "Events", { campaign_id: lk.camp["UK SME SEO Webinar"], estimated_budget: 30000, currency: "GBP", timeframe: "0-3 months" }),
    L("Harry Patel", "Patel & Sons Pharmacy", "harry@patelpharmacy.co.uk", "+447700900302", "United Kingdom", "Leicester", "Owner", "Healthcare", "11-50", ["SEO"], "Events", { campaign_id: lk.camp["UK SME SEO Webinar"], estimated_budget: 8000, currency: "GBP" }),
    L("Charlotte Evans", "Evans Interiors", "charlotte@evansinteriors.co.uk", "+447700900303", "United Kingdom", "Bristol", "Director", "Retail", "1-10", ["E-commerce", "Social Media"], "Google Ads", { estimated_budget: 6000, currency: "GBP" }),
    L("William Hughes", "Hughes Engineering", "william@hughes-eng.co.uk", "+447700900304", "United Kingdom", "Birmingham", "Marketing Executive", "Construction", "201-500", ["Website Development"], "LinkedIn"),
    L("Sneha Reddy", "GreenLeaf Organics", "sneha@greenleaf.in", "+919820012601", "India", "Hyderabad", "Co-founder", "E-commerce", "11-50", ["E-commerce", "Performance Marketing"], "Google Ads", { campaign_id: lk.camp["India D2C Growth Audit"], estimated_budget: 800000, currency: "INR", timeframe: "0-3 months", website: "https://greenleaf.in" }),
    L("Karan Malhotra", "StyleKart Fashion", "karan@stylekart.in", "+919820012602", "India", "Delhi", "Head of Growth", "E-commerce", "51-200", ["Performance Marketing", "AI Automation"], "Google Ads", { campaign_id: lk.camp["India D2C Growth Audit"], estimated_budget: 1500000, currency: "INR", timeframe: "0-3 months" }),
    L("Divya Menon", "Kerala Ayurveda Retreats", "divya@keralaretreats.in", "+919847012603", "India", "Kochi", "Marketing Manager", "Hospitality", "51-200", ["SEO", "Social Media"], "Website form", { estimated_budget: 300000, currency: "INR" }),
    L("Rahul Deshpande", "Deshpande Motors", "rahul@deshpandemotors.in", "+919822012604", "India", "Pune", "General Manager", "Retail", "201-500", ["CRM / ERP"], "Referral", { estimated_budget: 1200000, currency: "INR", timeframe: "3-6 months" }),
    L("Aaliyah Siddiqui", "Pearl Events Management", "aaliyah@pearlevents.ae", "+971521112205", "United Arab Emirates", "Dubai", "Founder", "Events", "11-50", ["Social Media", "Branding"], "Referral", { estimated_budget: 20000 }),
    L("Yousef Nasser", "Nasser Trading Group", "yousef@nassertrading.ae", "+971521112206", "United Arab Emirates", "Sharjah", "Director", "Retail", "201-500", ["E-commerce", "Website Development"], "Cold outreach", { estimated_budget: 90000, timeframe: "3-6 months" }),
    L("Maria Fernandes", "Fernandes Clinics", "maria@fernandesclinics.ae", "+971521112207", "United Arab Emirates", "Dubai", "Practice Manager", "Healthcare", "51-200", ["Performance Marketing", "SEO"], "Google Ads", { estimated_budget: 35000 }),
    L("Ben Carter", "Carter Fitness", "ben@carterfitness.co.uk", "+447700900305", "United Kingdom", "London", "Owner", "Hospitality", "1-10", ["Social Media"], "LinkedIn", { estimated_budget: 3000, currency: "GBP" }),
    L("Zara Ahmed", "Zara Couture", "zara@zaracouture.ae", "+971521112208", "United Arab Emirates", "Dubai", "Creative Director", "Retail", "11-50", ["E-commerce", "Branding"], "WhatsApp", { estimated_budget: 40000 }),
    L("Imran Sheikh", "Sheikh Consulting", "imran@sheikhconsulting.in", "+919820012605", "India", "Mumbai", "Partner", "Professional Services", "11-50", ["Website Development", "SEO"], "Website form", { currency: "INR" }),
    L("Laura Bennett", "Bennett Estates", "laura@bennettestates.co.uk", "+447700900306", "United Kingdom", "Oxford", "Director", "Real Estate", "11-50", ["Performance Marketing"], "Meta Lead Ads", { estimated_budget: 12000, currency: "GBP" }),
    L("Faisal Rahman", "Rahman Tech Solutions", "faisal@rahmantech.ae", "+971521112209", "United Arab Emirates", "Dubai", "CTO", "Technology", "51-200", ["AI Automation", "CRM / ERP"], "API", { estimated_budget: 120000, timeframe: "immediate" }),
    L("Pooja Jain", "Jain Jewellers", "pooja@jainjewellers.in", "+919820012606", "India", "Jaipur", "Marketing Head", "Retail", "51-200", ["Social Media", "Performance Marketing"], "Meta Lead Ads", { estimated_budget: 500000, currency: "INR" }),
    L("Samir Haddad", "", "samir.haddad@gmail.com", "+971521112210", "United Arab Emirates", "Dubai", "", "", "", ["Website Development"], "WhatsApp"),
    L("Chloe Wright", "Wright Architecture", "chloe@wrightarch.co.uk", "+447700900307", "United Kingdom", "Cambridge", "Principal Architect", "Construction", "11-50", ["Website Development", "Branding"], "Referral", { estimated_budget: 15000, currency: "GBP", timeframe: "0-3 months" }),
    L("Abdullah Al Otaibi", "Riyadh Smart Homes", "abdullah@riyadhsmarthomes.sa", "+966501234567", "Saudi Arabia", "Riyadh", "CEO", "Real Estate", "201-500", ["Performance Marketing", "AI Automation"], "LinkedIn", { campaign_id: lk.camp["LinkedIn Founder Outreach"], estimated_budget: 150000, timeframe: "0-3 months" }),
    L("Neha Gupta", "Gupta Education Trust", "neha@guptaedu.in", "+919820012607", "India", "Lucknow", "Trustee", "Education", "201-500", ["SEO", "Website Development"], "Events", { currency: "INR" }),
  ];
  const leadIds: string[] = [];
  for (const [i, raw] of leadRows.entries()) {
    const actor = i % 5 === 0 ? sara : rasheed; // marketing captures some leads; the rest via round-robin
    const r = await createLead(actor, i === 21 ? { ...raw, owner_id: null } : raw, { allowDuplicate: true, assignmentMethod: i === 21 ? "manual" : "country" });
    leadIds.push(r.id!);
  }
  // Progress some leads through the funnel.
  const leadCtx = async (id: string) => { const o = await withTenant(rasheed, (db) => db.one<{ owner_id: string | null }>("select owner_id from leads where id = $1", [id])); return [omar, priya].find((c) => c.userId === o?.owner_id) ?? aisha; };
  for (const [i, id] of leadIds.entries()) {
    const c = await leadCtx(id);
    if (i % 3 === 0 && i !== 21) await logActivity(c, { type: i % 2 ? "whatsapp" : "call", subject: "Intro call", outcome: i % 2 ? "No answer" : "Connected — interested", direction: "outbound", lead_id: id, occurred_at: days(-2), follow_up_at: days(i % 2 ? -1 : 2) });
    if (i === 0 || i === 3 || i === 9 || i === 19 || i === 23) await updateLead(aisha, id, { status: "qualified", authority: "decision_maker" });
    if (i === 7 || i === 15) await updateLead(aisha, id, { status: "unqualified" });
    if (i === 12) await updateLead(aisha, id, { status: "nurturing" });
  }
  await convertLead(aisha, leadIds[3]!, { create_opportunity: true, opportunity_name: "Skyline Tower Brokers — Lead Gen + CRM", value: 45000, currency: "AED", pipeline_id: lk.pipe, expected_close_date: date(35) });

  // ── Tasks & notes ──
  await saveTask(omar, null, { title: "Prepare Palm Crest media plan v2", priority: "high", due_at: days(1), opportunity_id: oppIds[0] });
  await saveTask(omar, null, { title: "Chase Desert Rose proposal feedback", priority: "medium", due_at: days(-1), opportunity_id: oppIds[1] });
  await saveTask(priya, null, { title: "Send Thames Valley contract via DocuSign", priority: "urgent", due_at: days(0.2), opportunity_id: oppIds[4] });
  await saveTask(aisha, null, { title: "Weekly pipeline review", priority: "medium", due_at: days(2), recurrence: "weekly" });
  await saveTask(aisha, null, { title: "GulfBuild vendor registration pack", priority: "high", due_at: days(-3), opportunity_id: oppIds[9], owner_id: ids.aisha });
  await saveTask(sara, null, { title: "Build Q4 webinar landing page", priority: "medium", due_at: days(5) });
  await logActivity(aisha, { type: "note", subject: "Procurement update", body: "Hassan confirmed budget approval; procurement requires trade licence + VAT certificate.", opportunity_id: oppIds[9] });
  await logActivity(priya, { type: "meeting", subject: "Proposal walkthrough", outcome: "Positive — verbal yes", body: "Emily wants to start in two weeks.", opportunity_id: oppIds[4], duration_min: 45, occurred_at: days(-1) });
  await updateOpportunity(aisha, oppIds[9]!, { risk_level: "high" });

  // ── Backdate history so dashboards show a realistic 6-month picture ──
  const a2 = new Client({ connectionString: process.env.DATABASE_ADMIN_URL }); await a2.connect();
  for (const [i, o] of opps.entries()) {
    if (o.wonAgo) await a2.query("update opportunities set won_at = now() - ($2 || ' days')::interval, closed_at = now() - ($2 || ' days')::interval, created_at = now() - ($3 || ' days')::interval where id = $1", [oppIds[i], String(o.wonAgo), String(o.wonAgo + 40)]);
    else if (o.lost) await a2.query("update opportunities set closed_at = now() + ($2 || ' days')::interval, created_at = now() - interval '70 days' where id = $1", [oppIds[i], String(o.close)]);
    else await a2.query("update opportunities set created_at = now() - ($2 || ' days')::interval, stage_entered_at = now() - ($3 || ' days')::interval where id = $1", [oppIds[i], String(20 + i * 3), String(2 + i)]);
  }
  await a2.query(`update leads set created_at = created_at - x.shift, first_response_due_at = first_response_due_at - x.shift,
    first_contacted_at = first_contacted_at - x.shift, last_contacted_at = last_contacted_at - x.shift
    from (select id, (row_number() over (order by created_at) || ' days')::interval shift from leads where org_id = $1) x
    where leads.id = x.id and leads.org_id = $1 and leads.status <> 'new'`, [orgId]);

  // ── Second tenant to demonstrate isolation ──
  const other = await a2.query("insert into users(email, name, password_hash) values ('admin@acmerealty.test','Acme Admin',$1) returning id", [hash]);
  await a2.end();
  const acme = await withSystem((db) => createOrganisation(db, other.rows[0].id, "Acme Realty (isolation demo)", "GBP"));
  const acmeCtx: Ctx = { ...(await ctxFor("rasheed")), userId: other.rows[0].id, orgId: acme, role: "owner" };
  acmeCtx.org = { ...acmeCtx.org, id: acme, currency: "GBP" };
  await createLead(acmeCtx, { full_name: "Confidential Acme Prospect", email: "secret@acme-prospect.test", company_name: "Acme Private Client" }, { allowDuplicate: true, assignmentMethod: "manual" });

  console.log(`\nSeed complete.\n  Organisation: DigiFalx (${orgId})\n  Password for all demo users: ${PASSWORD}`);
  for (const p of people) console.log(`  ${p.role.padEnd(9)} ${p.email}`);
  console.log(`  platform  platform@salesos.app (super admin)\n  other org admin@acmerealty.test (tenant isolation check)`);
  void platform;
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
