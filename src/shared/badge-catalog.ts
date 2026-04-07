/**
 * Lifestyle badge catalog — shared between server and client.
 * Badges signal sitter home environment, certifications, and experience
 * to help owners find compatible sitters (Rover parity).
 *
 * Some badges auto-derive from existing user columns (e.g. has_fenced_yard → "fenced_yard").
 * Others are stored in the user's `lifestyle_badges TEXT[]` column.
 */

export type BadgeCategory = 'home_environment' | 'certifications' | 'experience';

export interface BadgeDefinition {
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string; // lucide-react icon name
  readonly category: BadgeCategory;
  /**
   * If set, this badge is auto-derived from the given user column.
   * The column must be a boolean — when true the badge is active.
   * Sitters cannot toggle auto-derived badges manually.
   */
  readonly autoColumn?: string;
}

export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // ── Home Environment ──
  {
    slug: 'fenced_yard',
    label: 'Fenced Yard',
    description: 'Secure, fully fenced outdoor area for pets',
    icon: 'Fence',
    category: 'home_environment',
    autoColumn: 'has_fenced_yard',
  },
  {
    slug: 'smoke_free',
    label: 'Smoke-Free Home',
    description: 'No smoking in the home or around pets',
    icon: 'CigaretteOff',
    category: 'home_environment',
    autoColumn: 'non_smoking_home',
  },
  {
    slug: 'no_children',
    label: 'No Children',
    description: 'No children in the home',
    icon: 'Baby',
    category: 'home_environment',
  },
  {
    slug: 'no_other_pets',
    label: 'No Other Pets',
    description: 'No resident pets that could interact with yours',
    icon: 'PawPrint',
    category: 'home_environment',
  },
  {
    slug: 'dog_door',
    label: 'Has a Dog Door',
    description: 'Dog door for free outdoor access',
    icon: 'DoorOpen',
    category: 'home_environment',
  },
  {
    slug: 'one_client',
    label: 'One Client at a Time',
    description: 'Only hosts one family at a time for undivided attention',
    icon: 'UserCheck',
    category: 'home_environment',
    autoColumn: 'one_client_at_a_time',
  },

  // ── Certifications ──
  {
    slug: 'pet_first_aid',
    label: 'Pet First Aid / CPR',
    description: 'Certified in pet first aid and CPR',
    icon: 'HeartPulse',
    category: 'certifications',
  },
  {
    slug: 'insured',
    label: 'Insured',
    description: 'Carries pet care liability insurance',
    icon: 'Shield',
    category: 'certifications',
    autoColumn: 'has_insurance',
  },

  // ── Experience ──
  {
    slug: 'dog_training',
    label: 'Dog Training Experience',
    description: 'Experienced in obedience training and behavioral management',
    icon: 'GraduationCap',
    category: 'experience',
  },
  {
    slug: 'cat_care',
    label: 'Cat Care Experience',
    description: 'Specialized experience with feline care and behavior',
    icon: 'Cat',
    category: 'experience',
  },
  {
    slug: 'grooming_exp',
    label: 'Grooming Experience',
    description: 'Experienced with bathing, brushing, and coat care',
    icon: 'Scissors',
    category: 'experience',
  },
  {
    slug: 'medication_admin',
    label: 'Medication Administration',
    description: 'Experienced giving oral, topical, or injectable medications',
    icon: 'Pill',
    category: 'experience',
  },
  {
    slug: 'puppies_kittens',
    label: 'Puppies & Kittens',
    description: 'Experienced with young animals requiring extra care',
    icon: 'Baby',
    category: 'experience',
  },
  {
    slug: 'senior_pets',
    label: 'Senior Pets',
    description: 'Experienced caring for elderly pets with special needs',
    icon: 'Heart',
    category: 'experience',
  },
  {
    slug: 'special_needs',
    label: 'Special Needs Pets',
    description: 'Comfortable caring for pets with disabilities or chronic conditions',
    icon: 'Accessibility',
    category: 'experience',
  },
] as const;

/** All valid badge slugs */
export const BADGE_SLUGS = BADGE_CATALOG.map((b) => b.slug);

/** Badge slugs that are auto-derived from existing user columns */
export const AUTO_BADGE_SLUGS = BADGE_CATALOG
  .filter((b) => b.autoColumn != null)
  .map((b) => b.slug);

/** Badge slugs that sitters toggle manually */
export const MANUAL_BADGE_SLUGS = BADGE_CATALOG
  .filter((b) => b.autoColumn == null)
  .map((b) => b.slug);

/** Lookup badge definition by slug */
export function getBadgeBySlug(slug: string): BadgeDefinition | undefined {
  return BADGE_CATALOG.find((b) => b.slug === slug);
}

/** Get badge label by slug */
export function getBadgeLabel(slug: string): string {
  return getBadgeBySlug(slug)?.label ?? slug.replace(/_/g, ' ');
}

/** Get badges grouped by category */
export function getBadgesByCategory(): { category: BadgeCategory; label: string; badges: BadgeDefinition[] }[] {
  const categoryLabels: Record<BadgeCategory, string> = {
    home_environment: 'Home Environment',
    certifications: 'Certifications',
    experience: 'Experience',
  };
  return (Object.entries(categoryLabels) as [BadgeCategory, string][]).map(
    ([cat, label]) => ({
      category: cat,
      label,
      badges: BADGE_CATALOG.filter((b) => b.category === cat),
    }),
  );
}

/**
 * Resolve a sitter's active badges by combining auto-derived badges
 * from user columns with manually toggled badges from lifestyle_badges[].
 */
export function resolveActiveBadges(
  user: {
    has_fenced_yard?: boolean;
    non_smoking_home?: boolean;
    has_own_pets?: boolean;
    has_insurance?: boolean;
    one_client_at_a_time?: boolean;
    lifestyle_badges?: string[];
  },
): string[] {
  const active: string[] = [];

  // Auto-derived badges
  for (const badge of BADGE_CATALOG) {
    if (badge.autoColumn == null) continue;
    const value = (user as Record<string, unknown>)[badge.autoColumn];
    if (value === true) {
      active.push(badge.slug);
    }
  }

  // Manual badges
  if (user.lifestyle_badges) {
    for (const slug of user.lifestyle_badges) {
      if (MANUAL_BADGE_SLUGS.includes(slug) && !active.includes(slug)) {
        active.push(slug);
      }
    }
  }

  // Special case: no_other_pets derives from has_own_pets being false
  // Only add if the sitter explicitly has this in lifestyle_badges
  // (has_own_pets=false is the default, not an intentional signal)

  return active;
}
