import {Coffee, Bean, CupSoda, IceCreamBowl, GlassWater, Leaf, Wine, Sandwich, Salad, EggFried, Soup, UtensilsCrossed, Cookie, CookingPot, Citrus, CircleDot, Wheat, LayoutGrid} from 'lucide-react';
const icons: Record<string, typeof Coffee> = {
 'classic-hot-iced':Coffee,'cold-brew-iced-coffee':GlassWater,'non-coffee':CupSoda,
 frappes:IceCreamBowl,'cold-coffee':Bean,smoothies:Citrus,'refreshing-teas':Leaf,
 mocktails:Wine,'other-mixed':CupSoda,bagel:CircleDot,'sandwiches-wrap':Sandwich,
 toast:Wheat,salad:Salad,omelettes:EggFried,starters:Cookie,combo:UtensilsCrossed,
 pasta:Soup,'manual-brews':CookingPot,
};
export default function CategoryIcon({id}:{id:string}) {
 const Icon=icons[id] || LayoutGrid;
 return <Icon size={27} strokeWidth={1.7} aria-hidden="true" />;
}
