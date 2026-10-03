import {
  ArrowCounterClockwise, Basket, BookOpenText, Bus, Coffee, DeviceMobile, DotsThreeCircle, FilmSlate, GameController,
  HandCoins, Money, Moped, Popcorn, ShoppingCart, TShirt, UserCircle, UsersThree, Wallet,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

export const CAT_ICON: Record<string, Icon> = {
  food_delivery: Moped, campus_food: Coffee, groceries_snacks: ShoppingCart, transport: Bus, outing: FilmSlate,
  shopping: TShirt, recharge_bills: DeviceMobile, gaming: GameController, education: BookOpenText,
  transfer_to_person: UserCircle, transfer_from_person: HandCoins, allowance: Wallet, refund: ArrowCounterClockwise,
  cash_withdrawal: Money, other: DotsThreeCircle,
};

export const GROUP_META: Record<string, { color: string; Icon: Icon }> = {
  Essentials: { color: "#7c5cfc", Icon: Basket },
  Lifestyle: { color: "#12a150", Icon: Popcorn },
  "Friends & family": { color: "#f97316", Icon: UsersThree },
  "Cash & other": { color: "#f5b10a", Icon: Money },
};

export function catLabel(c: string | null | undefined): string {
  if (!c) return "Other";
  const s = c.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CatBadge({ category, size = 40 }: { category: string | null | undefined; size?: number }) {
  const I = CAT_ICON[category ?? "other"] ?? DotsThreeCircle;
  return (
    <span className="icon-badge" style={{ width: size, height: size }}>
      <I size={size * 0.5} weight="duotone" className="text-ink-2" />
    </span>
  );
}
