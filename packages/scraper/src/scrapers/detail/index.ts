/**
 * Export all detail scrapers.
 */

export { DetailScraper } from "./base.js";
export type { DetailScraperConstructor } from "./base.js";

// Ported detail scrapers
export { LaCabraDetailScraper } from "./lacabra.js";
export { TanatDetailScraper } from "./tanat.js";
export { DevocionDetailScraper } from "./devocion.js";
export { AprilDetailScraper } from "./april.js";
export { StandoutDetailScraper } from "./standout.js";
export { CoffeeOrgDetailScraper } from "./coffeeorg.js";
export { AmocDetailScraper } from "./amoc.js";
export { JeraDetailScraper } from "./jera.js";

// TODO: Port these (require OCR)
// export { DaturaDetailScraper } from "./datura.js";
// export { SceneryDetailScraper } from "./scenery.js";
