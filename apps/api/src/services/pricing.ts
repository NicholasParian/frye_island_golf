import {
  CART_FEE_PER_CART_CENTS,
  PUBLIC_GREEN_FEE_CENTS,
} from "@fig/shared";

export function bookingAmountCents(params: {
  isMember: boolean;
  partySize: number;
  cartCount: number;
}): number {
  if (params.isMember) return params.cartCount * CART_FEE_PER_CART_CENTS;
  return (
    PUBLIC_GREEN_FEE_CENTS * params.partySize +
    params.cartCount * CART_FEE_PER_CART_CENTS
  );
}
