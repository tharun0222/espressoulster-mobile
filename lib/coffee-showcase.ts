export type ShowcaseProduct = {
  id: string; name: string; price: number | null; available: boolean;
  inventory?: number | null; archived?: boolean; image?: string; imageAtlas?: boolean; imagePosition?: string;
};

// Print coordinates and cylindrical wrap are fitted to each original glass photo.
// Percentages keep the print attached to the glass at both hero and thumbnail sizes.
const glassDrinks = [
  {name: 'Caramel Cold Coffee', photo: 'source-05', logo: {x: 50, y: 51, width: 47.6, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'French Vanilla Iced Latte', photo: 'recipe-french-vanilla-iced-latte', logo: {x: 50, y: 49, width: 44.2, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Hazelnut Cold Coffee', photo: 'source-02', logo: {x: 50, y: 51, width: 43.4, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Iced Mocha', photo: 'recipe-iced-mocha-dry-shake', logo: {x: 49.5, y: 52, width: 43.4, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Vietnamese Iced Coffee', photo: 'source-11', logo: {x: 50, y: 44, width: 44.2, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Iced Americano', photo: 'recipe-iced-americano', logo: {x: 50, y: 44, width: 48.4, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Classic Cold Brew', photo: 'source-01', logo: {x: 52, y: 45, width: 51.9, ink: '#fff4df', curve: 18, tilt: 0, opacity: .86}},
  {name: 'Mango Cold Brew', photo: 'recipe-mango-cold-brew', logo: {x: 49, y: 51, width: 44.2, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Strawberry Iced Latte', photo: 'recipe-strawberry-iced-latte', logo: {x: 49.5, y: 48, width: 43.4, ink: '#302116', curve: 10, tilt: 0.5, opacity: .82}},
  {name: 'Iced Spanish Latte', photo: 'recipe-iced-spanish-latte', logo: {x: 48.5, y: 50, width: 43.4, ink: '#302116', curve: 10, tilt: -0.6, opacity: .82}},
  {name: 'Dirty Matcha Latte Iced', photo: 'recipe-dirty-matcha-latte-iced-dry-shake', logo: {x: 50, y: 51, width: 45.9, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Orange Iced Americano', photo: 'recipe-orange-iced-americano', logo: {x: 49, y: 50, width: 43.4, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Iced Coffee Lemonade', photo: 'recipe-iced-coffee-lemonade', logo: {x: 49, y: 47, width: 43.4, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Iced Chai Latte', photo: 'recipe-iced-chai-latte-dry-shake', logo: {x: 49.5, y: 49, width: 44.2, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Cold Chocolate', photo: 'source-07', logo: {x: 49.5, y: 49, width: 45.9, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Classic Cold Coffee', photo: 'source-06', logo: {x: 49.5, y: 48, width: 47.6, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Cookie Crumble Frappe', photo: 'recipe-cookie-crumble-frappe', logo: {x: 50, y: 51, width: 46.8, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Choco Chip Frappe', photo: 'recipe-choco-chip-frappe', logo: {x: 51, y: 51, width: 43.4, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Very Berry Smoothie', photo: 'recipe-very-berry-smoothie', logo: {x: 50, y: 48, width: 48.4, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Protein Power Smoothie', photo: 'recipe-protein-power-smoothie', logo: {x: 52, y: 48, width: 46.8, ink: '#302116', curve: 15, tilt: 0, opacity: .82}},
  {name: 'Chia Iced Tea', photo: 'recipe-chia-iced-tea', logo: {x: 49, y: 51, width: 39.9, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Lemon Mint Iced Tea', photo: 'recipe-lemon-mint-iced-tea', logo: {x: 49, y: 54, width: 41.6, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Peach Mint Iced Tea', photo: 'recipe-peach-mint-iced-tea', logo: {x: 48, y: 48, width: 39.9, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Peach Iced Tea', photo: 'recipe-peach-iced-tea', logo: {x: 49, y: 49, width: 39.9, ink: '#fff4df', curve: 10, tilt: 0, opacity: .86}},
  {name: 'Passion Mint Iced Tea', photo: 'recipe-passion-mint-iced-tea', logo: {x: 52, y: 48, width: 40.8, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
  {name: 'Virgin Mojito', photo: 'recipe-virgin-mojito', logo: {x: 48.5, y: 49, width: 43.4, ink: '#302116', curve: 10, tilt: 0, opacity: .82}},
 ];

export function availableShowcaseItems(products: ShowcaseProduct[]) {
  return glassDrinks.flatMap(({name, photo, logo}) => {
    const product = products.find(item => item.name.trim().toLowerCase() === name.toLowerCase() &&
      !item.archived && item.available && item.price != null &&
      Number.isFinite(item.price) && (item.inventory == null || item.inventory > 0));
    if (!product?.image) return [];
    const originalPhoto = product.image === `/images/menu/items/${photo}.webp` && !product.imageAtlas;
    return [{
      id: product.id, name: product.name, price: product.price!, image: product.image,
      imageAtlas: !!product.imageAtlas, imagePosition: product.imagePosition || "center",
      mask: originalPhoto ? `/images/menu/masks/${photo}.svg` : undefined,
      // An uploaded replacement may use a different cup: do not stamp it at stale coordinates.
      logo: originalPhoto ? logo : undefined,
    }];
  });
}
export type ShowcaseItem = ReturnType<typeof availableShowcaseItems>[number];
