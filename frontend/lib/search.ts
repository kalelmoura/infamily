/**
 * Prepare user-facing text for forgiving pt-BR search. Removing accents and
 * case means typing "joao" still finds "João" without changing stored data.
 */
export function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
