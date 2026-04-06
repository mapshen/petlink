export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

export interface SitterWithService extends User {
  /** Price in integer cents */
  price_cents: number;
  service_type: string;
  distance_meters?: number;
  accepted_pet_sizes?: string[];
  accepted_species?: string[];
  years_experience?: number;
  max_pets?: number;
  ranking_score?: number;
  is_new?: boolean;
  review_count?: number;
  avg_rating?: number | null;
  service_radius_miles?: number;
  addon_slugs?: string[];
}

export type HomeType = 'house' | 'apartment' | 'condo' | 'other';

export type SubscriptionTier = 'free' | 'pro' | 'premium';
export type ConnectStatus = 'not_started' | 'onboarding' | 'active' | 'restricted' | 'disabled';

export type CreditType = 'referral' | 'dispute_resolution' | 'promo' | 'beta_reward' | 'milestone' | 'redemption' | 'expiration';
export type CreditSourceType = 'dispute' | 'referral_invite' | 'admin_grant' | 'beta_program' | 'booking' | 'subscription' | 'system';

export interface CreditEntry {
  id: number;
  user_id: number;
  amount_cents: number;
  type: CreditType;
  source_type: CreditSourceType;
  source_id: number | null;
  description: string;
  expires_at: string | null;
  created_at: string;
}

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
  roles: string[];
  slug?: string;
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
  service_radius_miles?: number;
  max_pets_at_once?: number;
  max_pets_per_walk?: number;
  house_rules?: string;
  emergency_procedures?: string;
  has_insurance?: boolean;
  subscription_tier?: SubscriptionTier;
  approval_status?: 'approved' | 'pending_approval' | 'rejected' | 'banned' | 'onboarding';
  approval_rejected_reason?: string;
  is_admin?: boolean;
  avg_rating?: number | null;
  review_count?: number;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
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
  type: 'walking' | 'sitting' | 'drop-in' | 'grooming' | 'meet_greet' | 'daycare';
  /** Price in integer cents (e.g., 2500 = $25.00) */
  price_cents: number;
  description?: string;
  /** Additional pet fee in integer cents */
  additional_pet_price_cents?: number;
  max_pets?: number;
  service_details?: Record<string, unknown>;
  species?: string;
  /** Holiday rate override in integer cents */
  holiday_rate_cents?: number;
  /** Puppy/kitten rate override in integer cents */
  puppy_rate_cents?: number;
  /** Pickup/dropoff add-on fee in integer cents */
  pickup_dropoff_fee_cents?: number;
  /** Grooming add-on fee in integer cents */
  grooming_addon_fee_cents?: number;
}

export interface SitterSpeciesProfile {
  id: number;
  sitter_id: number;
  species: string;
  years_experience?: number;
  accepted_pet_sizes: string[];
  skills: string[];
  max_pets: number;
  max_pets_per_walk?: number;
  has_yard: boolean;
  has_fenced_yard: boolean;
  dogs_on_furniture: boolean;
  dogs_on_bed: boolean;
  potty_break_frequency?: string;
  accepts_puppies: boolean;
  accepts_unspayed: boolean;
  accepts_unneutered: boolean;
  accepts_females_in_heat: boolean;
  owns_same_species: boolean;
  own_pets_description?: string;
  created_at: string;
}

export interface CareInstruction {
  id: string;
  category: 'feeding' | 'medication' | 'exercise' | 'grooming' | 'behavioral' | 'litter_box' | 'cage_cleaning' | 'habitat_maintenance' | 'other';
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

export interface SitterAddon {
  id: number;
  sitter_id: number;
  addon_slug: string;
  price_cents: number;
  notes?: string | null;
  created_at: string;
}

export interface BookingAddon {
  booking_id: number;
  addon_id: number | null;
  addon_slug: string;
  price_cents: number;
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
  total_price_cents?: number;
  sitter_name?: string;
  sitter_avatar?: string;
  owner_name?: string;
  owner_avatar?: string;
  service_type?: string;
  pets?: { id: number; name: string; photo_url?: string; breed?: string }[];
  payment_method?: 'card' | 'ach_debit';
  deposit_status?: 'held' | 'captured_as_deposit' | 'applied' | 'released_to_sitter' | 'refunded' | null;
  deposit_applied_to_booking_id?: number | null;
  meet_greet_notes?: string | null;
  addons?: BookingAddon[];
}

export type IncidentCategory = 'pet_injury' | 'property_damage' | 'safety_concern' | 'behavioral_issue' | 'service_issue' | 'other';

export interface IncidentEvidence {
  id: number;
  incident_id: number;
  media_url: string;
  media_type: 'image' | 'video';
  created_at: string;
}

export interface IncidentReport {
  id: number;
  booking_id: number;
  reporter_id: number;
  category: IncidentCategory;
  description: string;
  notes?: string | null;
  evidence?: IncidentEvidence[];
  reporter_name?: string;
  reporter_avatar?: string | null;
  created_at: string;
}

export type DisputeStatus = 'open' | 'under_review' | 'awaiting_response' | 'resolved' | 'closed';
export type DisputeResolutionType = 'full_refund' | 'partial_refund' | 'credit' | 'warning_owner' | 'warning_sitter' | 'ban_sitter' | 'ban_owner' | 'no_action';

export interface Dispute {
  id: number;
  booking_id: number;
  incident_id?: number | null;
  filed_by: number;
  reason: string;
  status: DisputeStatus;
  assigned_admin_id?: number | null;
  resolution_type?: DisputeResolutionType | null;
  resolution_amount_cents?: number | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
  filed_by_name?: string;
  owner_name?: string;
  sitter_name?: string;
  owner_id?: number;
  sitter_id?: number;
  assigned_admin_name?: string | null;
  incident_count?: number;
  service_type?: string;
  total_price_cents?: number;
}

export interface DisputeMessage {
  id: number;
  dispute_id: number;
  sender_id: number;
  content: string;
  is_admin_note: boolean;
  evidence_urls: string[];
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
  sender_role?: 'owner' | 'sitter' | 'admin';
}

export type InquiryStatus = 'open' | 'offer_sent' | 'accepted' | 'declined' | 'expired';

export interface Inquiry {
  id: number;
  owner_id: number;
  sitter_id: number;
  service_type?: string;
  message: string;
  status: InquiryStatus;
  offer_price_cents?: number;
  offer_start_time?: string;
  offer_end_time?: string;
  offer_notes?: string;
  offer_sent_at?: string;
  booking_id?: number;
  created_at: string;
  updated_at: string;
  pets?: { id: number; name: string; photo_url?: string }[];
  owner_name?: string;
  owner_avatar?: string;
  sitter_name?: string;
  sitter_avatar?: string;
}

export interface Message {
  id: number;
  booking_id?: number;
  inquiry_id?: number;
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
  pet_care_rating?: number | null;
  communication_rating?: number | null;
  reliability_rating?: number | null;
  pet_accuracy_rating?: number | null;
  preparedness_rating?: number | null;
  response_text?: string | null;
  response_at?: string | null;
  created_at: string;
  published_at?: string | null;
  reviewer_name?: string;
  reviewer_avatar?: string;
  reviewee_name?: string;
  reviewee_avatar?: string;
  service_type?: string;
}

export interface BookingReviewState {
  reviews: Review[];
  can_review: boolean;
  can_respond: Record<number, boolean>;
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
  event_type: 'start' | 'pee' | 'poop' | 'photo' | 'end' | 'fed' | 'water' | 'medication' | 'nap_start' | 'nap_end' | 'play' | 'video' | 'litter_box' | 'habitat_check';
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
  amount_cents: number;
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

export type BackgroundCheckStatus = 'not_started' | 'pending' | 'passed' | 'failed';

export interface ProfileMember {
  id: number;
  sitter_id: number;
  name: string;
  avatar_url: string | null;
  role: 'co_sitter' | 'assistant';
  background_check_status: BackgroundCheckStatus;
  user_id?: number | null;
  created_at: string;
  updated_at: string;
}

export type TipStatus = 'pending' | 'succeeded' | 'failed';

export interface Tip {
  id: number;
  booking_id: number;
  tipper_id: number;
  sitter_id: number;
  amount_cents: number;
  status: TipStatus;
  created_at: string;
}

export interface AnalyticsOverview {
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_revenue_cents: number;
  avg_rating: number | null;
  review_count: number;
  avg_response_hours: number | null;
  completion_rate: number;
  cancellation_rate: number;
  repeat_client_pct: number;
  unique_clients: number;
  profile_views: number;
  monthly_revenue: { month: number; revenue_cents: number }[];
}

export interface ProfileViewsData {
  total_views: number;
  views_by_day: { date: string; count: number }[];
  views_by_source: { source: string; count: number }[];
}

export interface ClientSummary {
  client_id: number;
  client_name: string;
  client_avatar: string | null;
  total_bookings: number;
  completed_bookings: number;
  total_spent_cents: number;
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
  total_price_cents: number | null;
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
  imported_profile_id?: number | null;
  sitter_id: number;
  platform: ImportPlatform;
  reviewer_name: string;
  rating?: number;
  comment?: string;
  review_date?: string;
  created_at: string;
}

export interface SitterReference {
  id: number;
  sitter_id: number;
  client_name: string;
  client_email: string;
  rating?: number;
  comment?: string;
  status: 'pending' | 'completed';
  created_at: string;
  completed_at?: string;
}

export interface OwnerTrustProfile {
  owner_id: number;
  name: string;
  avatar_url: string | null;
  member_since: string;
  completed_bookings: number;
  cancelled_bookings: number;
  cancellation_rate: number;
  avg_rating: number | null;
  review_count: number;
  avg_pet_accuracy: number | null;
  avg_communication: number | null;
  avg_preparedness: number | null;
  pet_count: number;
  badges: ('verified_owner')[];
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
  revenue_cents: number;
  booking_count: number;
}

export type SitterPostType = 'update' | 'walk_photo' | 'walk_video' | 'care_update';

export interface SitterPost {
  id: number;
  sitter_id: number;
  content?: string;
  photo_url?: string;
  video_url?: string;
  booking_id?: number;
  walk_event_id?: number;
  post_type: SitterPostType;
  created_at: string;
}

export interface CalendarEvent {
  id: number;
  type: 'booking' | 'availability';
  title: string;
  start: string;
  end: string;
  status?: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  service_type?: string;
  owner_name?: string;
  owner_avatar?: string;
  pet_names?: string[];
  recurring?: boolean;
  availability_id?: number;
}
