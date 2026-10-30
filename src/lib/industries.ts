// Industries for benchmarks. Keep in step with the check on accounts.industry (migration 0037).
export const INDUSTRIES = [
  { id: "restaurant", label: "Restaurants & cafés", plural: "restaurants and cafés" },
  { id: "retail", label: "Shops & retail", plural: "shops" },
  { id: "ecommerce", label: "Online stores", plural: "online stores" },
  { id: "healthcare", label: "Clinics & healthcare", plural: "clinics" },
  { id: "beauty", label: "Salons & spas", plural: "salons and spas" },
  { id: "hospitality", label: "Hotels & travel", plural: "hotels and travel businesses" },
  { id: "education", label: "Education & training", plural: "schools and training centres" },
  { id: "software", label: "Software & IT", plural: "software and IT companies" },
  { id: "finance", label: "Banking & finance", plural: "finance businesses" },
  { id: "automotive", label: "Vehicles & garages", plural: "garages and dealers" },
  { id: "services", label: "Professional services", plural: "service businesses" },
  { id: "other", label: "Other", plural: "other businesses" },
] as const;

export type IndustryId = (typeof INDUSTRIES)[number]["id"];
export const INDUSTRY_IDS = INDUSTRIES.map((i) => i.id) as unknown as readonly [IndustryId, ...IndustryId[]];
export const industryOf = (id: string | null | undefined) => INDUSTRIES.find((i) => i.id === id) ?? null;
