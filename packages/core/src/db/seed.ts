import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { lookups } from "./schema";

/** Starting values for the editable dropdown lists. Directors change them in Settings. */
export const DEFAULT_LISTS: Record<string, string[]> = {
  category: ["Costumes", "Shoes", "Hats & Headwear", "Wigs & Hair", "Accessories & Jewelry", "Props", "Hand Props", "Furniture", "Set Pieces", "Flats & Platforms", "Drapes & Soft Goods", "Fabric & Materials", "Lighting", "Sound", "Makeup & FX", "Tools & Hardware", "Other"],
  subcategory: ["Dress / Gown", "Suit / Jacket", "Coat / Cape", "Shirt / Blouse", "Vest / Waistcoat", "Skirt", "Trousers / Breeches", "Uniform", "Robe", "Underpinnings / Corset / Petticoat", "Animal / Character Suit", "Chair", "Table", "Sofa / Settee", "Bed", "Desk", "Cabinet / Shelf", "Lamp", "Weapon (prop)", "Tableware", "Luggage", "Sign"],
  era: ["Ancient / Classical", "Medieval", "Renaissance / Elizabethan", "17th Century", "18th Century / Colonial", "Regency (1800–1830)", "Victorian (1837–1901)", "Old West", "Edwardian (1901–1914)", "1920s", "1930s", "1940s", "1950s", "1960s", "1970s", "1980s", "1990s", "Contemporary", "Fantasy / Storybook", "Sci-Fi / Futuristic", "Military", "Period-neutral"],
  gender: ["Men's", "Women's", "Unisex", "Boys'", "Girls'"],
  size: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "Child S", "Child M", "Child L", "One size", "Adjustable"],
  material: ["Cotton", "Wool", "Silk", "Satin", "Velvet", "Polyester", "Linen", "Lace", "Denim", "Leather", "Faux fur", "Brocade", "Chiffon", "Tulle", "Spandex", "Wood", "Metal", "Plastic", "Foam", "Upholstered", "Glass", "Wicker", "Cardboard / Paper"],
  color: ["Black", "White", "Ivory", "Red", "Burgundy", "Pink", "Orange", "Yellow", "Gold", "Green", "Blue", "Navy", "Purple", "Brown", "Tan", "Grey", "Silver", "Multicolor"],
  location: ["Costume Room", "Costume Room – Rack A", "Costume Room – Rack B", "Costume Room – Bins", "Prop Cage", "Scene Shop", "Under Stage", "Loft", "Off-site Storage"],
  show_type: ["Play", "Musical", "One-Acts", "Revue / Showcase", "Children's Theatre", "Other"],
  season: ["Fall", "Winter", "Spring", "Summer"],
  team_position: ["Director", "Assistant Director", "Technical Director", "Music Director", "Vocal Director", "Choreographer", "Assistant Choreographer", "Stage Manager", "Assistant Stage Manager", "Producer", "Accompanist", "Pit Conductor", "Costume Designer", "Set Designer", "Lighting Designer", "Sound Designer", "Hair & Makeup Designer", "Props Master", "Fight / Intimacy Director", "Dramaturg", "Dance Captain"],
  crew_position: ["Light Board Operator", "Sound Board Operator", "Spotlight Operator", "Fly Rail", "Running Crew", "Deck Crew", "Set Construction", "Scenic Painter", "Props Crew", "Costume Crew", "Wardrobe / Dresser", "Hair & Makeup Crew", "Mic Wrangler", "House Manager", "Usher", "Box Office", "Concessions", "Publicity", "Photographer", "Videographer"],
  instrument: ["Conductor", "Piano", "Keyboard 1", "Keyboard 2", "Synthesizer", "Guitar", "Bass", "Drums", "Percussion", "Violin", "Viola", "Cello", "Flute", "Clarinet", "Reed 1", "Reed 2", "Saxophone", "Trumpet", "Trombone", "French Horn"],
  voice_part: ["Soprano", "Mezzo-Soprano", "Alto", "Tenor", "Baritone", "Bass", "Treble", "Non-singing"],
  material_type: ["Script", "Libretto", "Vocal score", "Piano / conductor score", "Orchestra parts", "Rehearsal tracks", "Choreography notes", "Program", "Poster / Artwork", "Rehearsal schedule", "Blocking notes", "Design drawings", "Costume plot", "Prop list", "Light plot", "Sound cues", "Rights & licensing", "Budget", "Forms & permissions", "Other"],
  licensor: ["Music Theatre International (MTI)", "Concord Theatricals", "Theatrical Rights Worldwide (TRW)", "Broadway Licensing", "Dramatists Play Service", "Pioneer Drama Service", "Playscripts", "Stage Rights", "Dramatic Publishing"],
  sponsor_tier: ["Producer", "Director", "Star", "Supporting Player", "Friend of the Theatre", "Patron"],
  ad_size: ["Full page", "Half page", "Quarter page", "Business card", "Name listing"],
};

export const LIST_LABELS: Record<string, string> = {
  category: "Categories", subcategory: "Item types", era: "Eras / periods", gender: "Genders", size: "Sizes", material: "Materials", color: "Colors",
  location: "Storage locations", show_type: "Show types", season: "Seasons", team_position: "Production team positions", crew_position: "Crew positions",
  instrument: "Pit instruments", voice_part: "Voice parts", material_type: "Show material types", licensor: "Licensing companies", sponsor_tier: "Sponsor tiers", ad_size: "Program ad sizes",
};

/** Fill any list that has never been set up. Safe to run on every start. */
export function seedLookups(db: BetterSQLite3Database<Record<string, unknown>>) {
  const have = new Set(db.select({ list: lookups.list }).from(lookups).groupBy(lookups.list).all().map((r) => r.list));
  const rows = Object.entries(DEFAULT_LISTS).filter(([k]) => !have.has(k)).flatMap(([list, vals]) => vals.map((value, sort) => ({ list, value, sort })));
  if (rows.length) db.insert(lookups).values(rows).onConflictDoNothing().run();
  void sql;
}
