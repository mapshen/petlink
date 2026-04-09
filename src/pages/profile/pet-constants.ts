export const SPECIES_OPTIONS = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'reptile', label: 'Reptile' },
  { value: 'small_animal', label: 'Small Animal' },
] as const;

export const GENDER_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

export const ENERGY_LEVELS = [
  { value: '', label: 'Not specified' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

export const TEMPERAMENT_TAGS = [
  'friendly', 'shy', 'anxious', 'reactive', 'good_with_kids',
  'good_with_dogs', 'good_with_cats', 'playful', 'calm', 'independent',
] as const;

export function formatTag(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export interface PetFormData {
  name: string;
  species: string;
  breed: string;
  age: string;
  weight: string;
  gender: string;
  spayed_neutered: boolean | null;
  energy_level: string;
  house_trained: boolean | null;
  temperament: string[];
  special_needs: string;
  microchip_number: string;
  vet_name: string;
  vet_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  medical_history: string;
  photo_url: string;
}

export const emptyForm: PetFormData = {
  name: '', species: 'dog', breed: '', age: '', weight: '',
  gender: '', spayed_neutered: null, energy_level: '', house_trained: null,
  temperament: [], special_needs: '', microchip_number: '',
  vet_name: '', vet_phone: '', emergency_contact_name: '', emergency_contact_phone: '',
  medical_history: '', photo_url: '',
};
