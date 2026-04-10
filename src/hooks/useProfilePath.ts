import { useAuth } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';

export function useProfilePath(): string {
  const { user } = useAuth();
  const { mode } = useMode();

  if (!user?.slug) return '/profile';

  const hasSitterRole = user.roles?.includes('sitter') ?? false;
  if (mode === 'sitter' && hasSitterRole) return `/sitter/${user.slug}`;
  return `/owner/${user.slug}`;
}
