export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

export type HomeType = 'house' | 'apartment' | 'condo' | 'other';

export type SubscriptionTier = 'free' | 'pro';

export interface SitterSubscription {
  id: number;
  sitter_id: number;
  tier: SubscriptionTier;
  stripe_subscription_id?: string;
  status: 'active' | 'past_due' | 'cancelled';
  current_period_start?: string;
  current_period_end?: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'sitter' | 'both';
  bio?: string;
  avatar_url?: string;
  lat?: number;
  lng?: number;
  accepted_pet_sizes?: string[];
  accepted_species?: string[];
  cancellation_policy?: CancellationPolicy;
  years_experience?: number;
  home_type?: HomeType;
  has_yard?: boolean;
  has_fenced_yard?: boolean;
  has_own_pets?: boolean;
  own_pets_description?: string;
  skills?: string[];
  subscription_tier?: SubscriptionTier;
  approval_status?: 'approved' | 'pending_approval' | 'rejected' | 'banned';
  approval_rejected_reason?: string;
  is_admin?: boolean;
  avg_rating?: number | null;
  review_count?: number;
}

export type PetSpecies = 'dog' | 'cat' | 'bird' | 'reptile' | 'small_animal';
export type PetGender = 'male' | 'female';
export type EnergyLevel = 'low' | 'medium' | 'high';

export interface Pet {
  id: number;
  owner_id: number;
  name: string;
  species: PetSpecies;
  breed?: string;
  age?: number;
  weight?: number;
  gender?: PetGender;
  spayed_neutered?: boolean;
  energy_level?: EnergyLevel;
  house_trained?: boolean;
  temperament?: string[];
  special_needs?: string;
  microchip_number?: string;
  vet_name?: string;
  vet_phone?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  medical_history?: string;
  photo_url?: string;
  care_instructions?: CareInstruction[];
}

export interface PetVaccination {
  id: number;
  pet_id: number;
  vaccine_name: string;
  administered_date?: string;
  expires_at?: string;
  document_url?: string;
  created_at: string;
}

export interface Service {
  id: number;
  sitter_id: number;
  type: 'walking' | 'sitting' | 'drop-in' | 'grooming' | 'meet_greet';
  price: number;
  description?: string;
  additional_pet_price?: number;
  max_pets?: number;
  service_details?: Record<string, unknown>;
}

export interface CareInstruction {
  id: string;
  category: 'feeding' | 'medication' | 'exercise' | 'grooming' | 'behavioral' | 'other';
  description: string;
  time?: string;
  notes?: string;
}

export interface BookingCareTask {
  id: number;
  booking_id: number;
  pet_id: number;
  pet_name?: string;
  category: string;
  description: string;
  time?: string;
  notes?: string;
  completed: boolean;
  completed_at?: string;
  created_at: string;
}

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface RecurringBooking {
  id: number;
  owner_id: number;
  sitter_id: number;
  service_id: number;
  pet_ids: number[];
  frequency: RecurrenceFrequency;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
  next_occurrence: string;
  created_at: string;
  sitter_name?: string;
  service_type?: string;
}

export interface FeaturedListing {
  id: number;
  sitter_id: number;
  service_type?: string;
  commission_rate: number;
  active: boolean;
  impressions: number;
  clicks: number;
  bookings_from_promotion: number;
  commission_earned_cents: number;
  created_at: string;
}

export interface Booking {
  id: number;
  sitter_id: number;
  owner_id: number;
  pet_id?: number;
  service_id?: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  start_time: string;
  end_time: string;
  total_price?: number;
  sitter_name?: string;
  sitter_avatar?: string;
  owner_name?: string;
  owner_avatar?: string;
  service_type?: string;
  pets?: { id: number; name: string; photo_url?: string; breed?: string }[];
  payment_method?: 'card' | 'ach_debit';
}

export interface Message {
  id: number;
  booking_id?: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  created_at: string;
  read_at?: string | null;
}

export interface Conversation {
  other_user_id: number;
  other_user_name: string;
  other_user_avatar: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface Review {
  id: number;
  booking_id: number;
  reviewer_id: number;
  reviewee_id: number;
  rating: number;
  comment?: string;
  created_at: string;
  reviewer_name?: string;
  reviewer_avatar?: string;
}

export interface Availability {
  id: number;
  sitter_id: number;
  day_of_week?: number;
  specific_date?: string;
  start_time: string;
  end_time: string;
  recurring: boolean;
}

export interface WalkEvent {
  id: number;
  booking_id: number;
  event_type: 'start' | 'pee' | 'poop' | 'photo' | 'end' | 'fed' | 'water' | 'medication' | 'nap_start' | 'nap_end' | 'play' | 'video';
  lat?: number;
  lng?: number;
  note?: string;
  photo_url?: string;
  video_url?: string;
  pet_id?: number;
  pet_name?: string;
  created_at: string;
}

export interface Favorite {
  id: number;
  user_id: number;
  sitter_id: number;
  created_at: string;
}

export interface FavoriteSitter {
  id: number;
  sitter_id: number;
  created_at: string;
  sitter_name: string;
  sitter_avatar: string | null;
  sitter_bio: string | null;
}

export type OAuthProvider = 'google' | 'apple' | 'facebook';

export interface LinkedAccount {
  provider: OAuthProvider;
  email: string | null;
  created_at: string;
}

export interface SitterPhoto {
  id: number;
  sitter_id: number;
  photo_url: string;
  caption: string;
  sort_order: number;
  created_at: string;
}

export type ExpenseCategory = 'supplies' | 'transportation' | 'insurance' | 'marketing' | 'equipment' | 'training' | 'other';

export interface SitterExpense {
  id: number;
  sitter_id: number;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  date: string;
  receipt_url?: string;
  created_at: string;
}

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SitterPayout {
  id: number;
  booking_id: number;
  sitter_id: number;
  amount_cents: number;
  status: PayoutStatus;
  scheduled_at: string;
  processed_at?: string | null;
  stripe_transfer_id?: string | null;
  created_at: string;
}

export interface AnalyticsOverview {
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_revenue: number;
  avg_rating: number | null;
  review_count: number;
  avg_response_hours: number | null;
  completion_rate: number;
  cancellation_rate: number;
  repeat_client_pct: number;
  unique_clients: number;
  monthly_revenue: { month: number; revenue: number }[];
}

export interface ClientSummary {
  client_id: number;
  client_name: string;
  client_avatar: string | null;
  total_bookings: number;
  completed_bookings: number;
  total_spent: number;
  first_booking_date: string;
  last_booking_date: string;
  pets: { id: number; name: string; species?: string; photo_url?: string }[];
}

export interface ClientBookingDetail {
  id: number;
  status: string;
  service_type: string | null;
  start_time: string;
  end_time: string;
  total_price: number | null;
  pets: { id: number; name: string }[];
  created_at: string;
}

export type ImportPlatform = 'rover' | 'wag' | 'care_com';
export type ImportVerificationStatus = 'pending' | 'verified' | 'failed';

export interface ImportedProfile {
  id: number;
  sitter_id: number;
  platform: ImportPlatform;
  profile_url: string;
  username?: string;
  display_name?: string;
  bio?: string;
  rating?: number;
  review_count?: number;
  verification_code?: string;
  verification_status: ImportVerificationStatus;
  verified_at?: string;
  scraped_at: string;
  created_at: string;
}

export interface ImportedReview {
  id: number;
  imported_profile_id: number;
  sitter_id: number;
  platform: ImportPlatform;
  reviewer_name: string;
  rating?: number;
  comment?: string;
  review_date?: string;
  created_at: string;
}

export interface ScrapedProfile {
  name: string;
  bio: string;
  rating: number;
  reviewCount: number;
  reviews: ScrapedReview[];
}

export interface ScrapedReview {
  reviewerName: string;
  rating: number;
  comment: string;
  date?: string;
}

export interface RevenueDataPoint {
  period: string;
  revenue: number;
  booking_count: number;
}
