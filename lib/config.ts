/** Amministratori / Owner dell'app. */
export const OWNERS = ["Valerio Andreuccioli", "Andrea Balzano"] as const;

/** Username con privilegi di amministratore. */
export const ADMIN_USERNAMES = ["valerio.andreuccioli", "andrea.balzano"] as const;

export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return (ADMIN_USERNAMES as readonly string[]).includes(username.trim().toLowerCase());
}

