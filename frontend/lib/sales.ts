import type { PaymentMethod } from "@/lib/types";

// Domain codes from the API paired with the pt-BR labels shown in every sales
// view. Keeping this map shared prevents the form and history from drifting.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao: "Cartão",
  fiado: "Fiado",
};

export const PAYMENT_METHOD_OPTIONS = Object.entries(
  PAYMENT_METHOD_LABELS,
) as [PaymentMethod, string][];
