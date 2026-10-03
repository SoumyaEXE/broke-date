import {
  ArrowCounterClockwise, BookOpenText, Bus, Coffee, DeviceMobile, DotsThreeCircle, FilmSlate, GameController,
  HandCoins, Money, Moped, ShoppingCart, TShirt, UserCircle, Wallet,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

const ICONS: Record<string, Icon> = {
  food_delivery: Moped, campus_food: Coffee, groceries_snacks: ShoppingCart, transport: Bus, outing: FilmSlate,
  shopping: TShirt, recharge_bills: DeviceMobile, gaming: GameController, education: BookOpenText,
  transfer_to_person: UserCircle, transfer_from_person: HandCoins, allowance: Wallet, refund: ArrowCounterClockwise,
  cash_withdrawal: Money, other: DotsThreeCircle,
};

export const catIcon = (c: string | null | undefined): Icon => ICONS[c ?? "other"] ?? DotsThreeCircle;

export function catLabel(c: string | null | undefined): string {
  if (!c) return "Other";
  const s = c.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function planCategory(name: string): string {
  if (/movie|cinema|popcorn|pvr|inox/i.test(name)) return "outing";
  if (/biryani|food|momo|treat|pizza|swiggy|zomato|lunch|dinner/i.test(name)) return "food_delivery";
  if (/phone|earphone|headphone|shoe|shirt|clothes|kurta/i.test(name)) return "shopping";
  if (/bus|train|cab|uber|ola|trip|travel/i.test(name)) return "transport";
  if (/game|top.?up|pubg|bgmi/i.test(name)) return "gaming";
  return "other";
}
