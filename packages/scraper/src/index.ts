/**
 * @brewnanza/scraper - Coffee scraper package
 *
 * Exports models, scrapers, utilities, and config.
 */

// Models
export * from "./models.js";

// Config
export * from "./config.js";

// Scrapers
export * from "./scrapers/index.js";

// Utilities
export * from "./utils.js";
export * from "./currency.js";

// Roaster registration
import { registerRoaster, type RoasterConfig } from "./config.js";
import { ShopifyJsonScraper } from "./scrapers/shopify-json.js";
import { WooCommerceScraper } from "./scrapers/woocommerce.js";
import { DakScraper } from "./scrapers/dak.js";

// Register all roasters
const roasters: RoasterConfig[] = [
  {
    id: "friedhats",
    name: "Friedhats",
    baseUrl: "https://friedhats.com",
    collectionUrl: "https://friedhats.com/collections/coffees",
    scraper: ShopifyJsonScraper,
    currency: "EUR",
  },
  {
    id: "lacabra",
    name: "La Cabra",
    baseUrl: "https://lacabra.com",
    collectionUrl: "https://lacabra.com/collections/coffee",
    scraper: ShopifyJsonScraper,
    currency: "EUR",
  },
  {
    id: "kbcoffee",
    name: "KB Coffee Roasters",
    baseUrl: "https://kbcoffeeroasters.com",
    collectionUrl: "https://kbcoffeeroasters.com/collections/all/coffee",
    scraper: ShopifyJsonScraper,
    apiUrl: "https://kbcoffeeroasters.com/products.json",
    currency: "EUR",
  },
  {
    id: "tanat",
    name: "Tanat Coffee",
    baseUrl: "https://tanat.coffee",
    collectionUrl: "https://tanat.coffee/en/categorie-produit/cafes/",
    scraper: WooCommerceScraper,
    categoryFilter: "cafes",
    currency: "EUR",
  },
  {
    id: "coffeeorg",
    name: "Coffee Organization",
    baseUrl: "https://coffeeorg.co",
    collectionUrl: "https://coffeeorg.co/en/collections/%D7%97%D7%93-%D7%96%D7%A0%D7%99%D7%99%D7%9D",
    scraper: ShopifyJsonScraper,
    currency: "ILS",
  },
  {
    id: "hydrangea",
    name: "Hydrangea Coffee",
    baseUrl: "https://hydrangea.coffee",
    collectionUrl: "https://hydrangea.coffee/collections/all",
    scraper: ShopifyJsonScraper,
    currency: "USD",
  },
  {
    id: "devocion",
    name: "Devoción",
    baseUrl: "https://www.devocion.com",
    collectionUrl: "https://www.devocion.com/collections/coffee",
    scraper: ShopifyJsonScraper,
    apiUrl: "https://www.devocion.com/products.json",
    currency: "USD",
  },
  {
    id: "manhattan",
    name: "Manhattan Coffee Roasters",
    baseUrl: "https://manhattancoffeeroasters.com",
    collectionUrl: "https://manhattancoffeeroasters.com/shop/",
    scraper: WooCommerceScraper,
    categoryFilter: "19",
    currency: "EUR",
  },
  {
    id: "datura",
    name: "Datura Coffee",
    baseUrl: "https://daturacoffee.com",
    collectionUrl: "https://daturacoffee.com/collections/frontpage",
    scraper: ShopifyJsonScraper,
    currency: "EUR",
  },
  {
    id: "scenery",
    name: "Scenery Coffee",
    baseUrl: "https://scenery.coffee",
    collectionUrl: "https://scenery.coffee/collections/coffee-1",
    scraper: ShopifyJsonScraper,
    currency: "GBP",
  },
  {
    id: "amoc",
    name: "A Matter of Concrete",
    baseUrl: "https://amatterofconcrete.com",
    collectionUrl: "https://amatterofconcrete.com/shop/",
    scraper: WooCommerceScraper,
    categoryFilter: "coffee",
    currency: "EUR",
  },
  {
    id: "april",
    name: "April Coffee Roasters",
    baseUrl: "https://www.aprilcoffeeroasters.com",
    collectionUrl: "https://www.aprilcoffeeroasters.com/collections/april-coffee-beans",
    scraper: ShopifyJsonScraper,
    currency: "DKK",
  },
  {
    id: "standout",
    name: "Standout Coffee",
    baseUrl: "https://www.standoutcoffee.com",
    collectionUrl: "https://www.standoutcoffee.com/collections/specialty-coffee",
    scraper: ShopifyJsonScraper,
    apiUrl: "https://www.standoutcoffee.com/products.json",
    currency: "SEK",
  },
  {
    id: "jera",
    name: "Jera Coffee",
    baseUrl: "https://www.jera-coffee.co.il",
    collectionUrl: "https://www.jera-coffee.co.il/%d7%9e%d7%95%d7%a6%d7%a8%d7%99%d7%9d/",
    scraper: WooCommerceScraper,
    categoryFilter: "23",
    currency: "ILS",
  },
  {
    id: "dak",
    name: "DAK Coffee Roasters",
    baseUrl: "https://www.dakcoffeeroasters.com",
    collectionUrl: "https://www.dakcoffeeroasters.com/shop",
    scraper: DakScraper,
    currency: "EUR",
  },
];

// Register all roasters on module load
for (const config of roasters) {
  registerRoaster(config);
}
