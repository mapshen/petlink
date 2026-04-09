/** Check if user has access to a space based on its role_gate */
export function canAccessSpace(userRoles: string[], roleGate: string[] | null): boolean {
  if (!roleGate || roleGate.length === 0) return true;
  return roleGate.some(role => userRoles.includes(role));
}
