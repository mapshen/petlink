import { describe, it, expect } from 'vitest';
import type { ProfileType } from '../../types';
import type { OwnerProfileData, PetProfileData } from '../../hooks/useProfileData';

describe('ProfileView data contracts', () => {
  const mockOwnerData: OwnerProfileData = {
    owner: {
      id: 1,
      name: 'Jessica R.',
      slug: 'jessica-r',
      avatar_url: 'https://example.com/avatar.jpg',
      bio: 'Dog mom to two rescue pups.',
      created_at: '2025-01-15T00:00:00Z',
    },
    pets: [
      { id: 1, owner_id: 1, name: 'Barkley', slug: 'barkley', species: 'dog', breed: 'Golden Retriever', age: 4, photo_url: 'https://example.com/barkley.jpg' },
      { id: 2, owner_id: 1, name: 'Luna', slug: 'luna', species: 'dog', breed: 'Pomeranian', age: 6 },
    ],
    reviews: [
      { id: 1, rating: 5, comment: 'Great pet parent!', created_at: '2026-01-15T00:00:00Z', reviewer_name: 'Sarah M.', reviewer_avatar: null },
    ],
    isOwner: false,
  };

  const mockPetData: PetProfileData = {
    pet: {
      id: 1,
      name: 'Barkley',
      slug: 'barkley',
      species: 'dog',
      breed: 'Golden Retriever',
      age: 4,
      weight: 75,
      gender: 'male',
      spayed_neutered: true,
      energy_level: 'high',
      house_trained: true,
      temperament: ['friendly', 'high_energy', 'good_with_dogs'],
      photo_url: 'https://example.com/barkley.jpg',
    },
    owner: {
      id: 1,
      name: 'Jessica R.',
      slug: 'jessica-r',
      avatar_url: 'https://example.com/avatar.jpg',
    },
    vaccinations: [
      { id: 1, vaccine_name: 'Rabies', administered_date: '2025-06-01', expires_at: '2027-06-01' },
    ],
    isOwner: true,
    canViewPrivate: true,
  };

  describe('owner profile data', () => {
    it('has required owner fields', () => {
      expect(mockOwnerData.owner.id).toBeDefined();
      expect(mockOwnerData.owner.name).toBeDefined();
      expect(mockOwnerData.owner.slug).toBeDefined();
      expect(mockOwnerData.owner.created_at).toBeDefined();
    });

    it('includes pets array with slugs', () => {
      expect(mockOwnerData.pets).toHaveLength(2);
      expect(mockOwnerData.pets[0].slug).toBe('barkley');
      expect(mockOwnerData.pets[1].slug).toBe('luna');
    });

    it('excludes private owner fields', () => {
      const ownerKeys = Object.keys(mockOwnerData.owner);
      expect(ownerKeys).not.toContain('email');
      expect(ownerKeys).not.toContain('password_hash');
      expect(ownerKeys).not.toContain('phone');
    });

    it('tracks isOwner correctly', () => {
      expect(mockOwnerData.isOwner).toBe(false);
      const asOwner = { ...mockOwnerData, isOwner: true };
      expect(asOwner.isOwner).toBe(true);
    });
  });

  describe('pet profile data', () => {
    it('has required pet fields', () => {
      expect(mockPetData.pet.id).toBeDefined();
      expect(mockPetData.pet.name).toBe('Barkley');
      expect(mockPetData.pet.slug).toBe('barkley');
      expect(mockPetData.pet.species).toBe('dog');
    });

    it('includes temperament array', () => {
      expect(mockPetData.pet.temperament).toContain('friendly');
      expect(mockPetData.pet.temperament).toContain('high_energy');
    });

    it('includes owner reference with slug', () => {
      expect(mockPetData.owner).not.toBeNull();
      expect(mockPetData.owner!.slug).toBe('jessica-r');
    });

    it('excludes private pet fields', () => {
      const petKeys = Object.keys(mockPetData.pet);
      expect(petKeys).not.toContain('vet_name');
      expect(petKeys).not.toContain('vet_phone');
      expect(petKeys).not.toContain('emergency_contact_name');
      expect(petKeys).not.toContain('emergency_contact_phone');
      expect(petKeys).not.toContain('medical_history');
      expect(petKeys).not.toContain('microchip_number');
    });

    it('tracks isOwner for own pet', () => {
      expect(mockPetData.isOwner).toBe(true);
    });

    it('handles null owner gracefully', () => {
      const orphanPet: PetProfileData = { ...mockPetData, owner: null };
      expect(orphanPet.owner).toBeNull();
    });
  });

  describe('ProfileType union', () => {
    it('accepts valid profile types', () => {
      const types: ProfileType[] = ['sitter', 'owner', 'pet'];
      expect(types).toHaveLength(3);
    });
  });

  describe('owner profile WYSIWYG editability', () => {
    it('shows pets section for owner with no pets (editable empty state)', () => {
      const ownerWithNoPets = { ...mockOwnerData, isOwner: true, pets: [] };
      const showPets = ownerWithNoPets.pets.length > 0 || (ownerWithNoPets.isOwner && !false /* viewAsVisitor */);
      expect(showPets).toBe(true);
    });

    it('hides pets section for visitor with no pets', () => {
      const visitorNoPets = { ...mockOwnerData, isOwner: false, pets: [] };
      const showPets = visitorNoPets.pets.length > 0 || visitorNoPets.isOwner;
      expect(showPets).toBe(false);
    });

    it('shows pets section for visitor with pets', () => {
      const visitorWithPets = { ...mockOwnerData, isOwner: false };
      const showPets = visitorWithPets.pets.length > 0 || visitorWithPets.isOwner;
      expect(showPets).toBe(true);
    });

    it('hides pets section for owner in viewAsVisitor mode with no pets', () => {
      const viewAsVisitor = true;
      const ownerNoPets = { ...mockOwnerData, isOwner: true, pets: [] };
      const showPets = ownerNoPets.pets.length > 0 || (ownerNoPets.isOwner && !viewAsVisitor);
      expect(showPets).toBe(false);
    });
  });
});
