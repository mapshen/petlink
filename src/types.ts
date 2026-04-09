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
  founding_sitter?: boolean;
  lifestyle_badges?: string[];
  non_smoking_home?: boolean;
  has_insurance?: boolean;
  one_client_at_a_time?: boolean;
  has_fenced_yard?: boolean;
  avg_response_hours?: number | null;
  repeat_client_count?: number;
  completion_rate?: number | null;
  member_since?: string;
  has_availability?: boolean;
}

export type HomeType = 'house' | 'apartment' | 'condo' | 'other';

export type SubscriptionTier = 'free' | 'pro' | 'premium';
export type ConnectStatus = 'not_started' | 'onboarding' | 'active' | 'restricted' | 'disabled';

export type CreditType = 'referral' | 'dispute_resolution' | 'promo' | 'beta_reward' | 'milestone' | 'redemption' | 'expiration' | 'dormancy_forfeiture';
export type CreditSourceType = 'dispute' | 'referral_invite' | 'admin_grant' | 'beta_program' | 'booking' | 'subscription' | 'system';

export type MentorshipStatus = 'active' | 'completed' | 'cancelled';

export interface Mentorship {
  readonly id: number;
  readonly mentor_id: number;
  readonly mentee_id: number;
  readonly status: MentorshipStatus;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly notes: string | null;
  readonly mentor_name?: string;
  readonly mentor_avatar?: string | null;
  readonly mentee_name?: string;
  readonly mentee_avatar?: string | null;
}

export type MentorshipAgreementStatus = 'pending' | 'active' | 'cancelled' | 'completed' | 'expired';

export interface MentorshipAgreement {
  readonly id: number;
  readonly mentorship_id: number;
  readonly mentor_id: number;
  readonly mentee_id: number;
  readonly share_percentage: number;
  readonly duration_months: number;
  readonly min_earnings_cents: number;
  readonly status: MentorshipAgreementStatus;
  readonly started_at: string | null;
  readonly expires_at: string | null;
  readonly cancelled_at: string | null;
  readonly created_at: string;
  readonly mentor_name?: string;
  readonly mentee_name?: string;
}

export interface MentorshipPayout {
  readonly id: number;
  readonly agreement_id: number;
  readonly booking_id: number;
  readonly mentor_amount_cents: number;
  readonly mentee_amount_cents: number;
  readonly booking_total_cents: number;
  readonly created_at: string;
}

export type BetaCohort = 'founding' | 'early_beta' | 'post_beta';
export type ProPeriodSource = 'beta' | 'trial' | 'beta_transition';
export type ProPeriodStatus = 'active' | 'expired' | 'cancelled';

export interface CreditEntry {
  id: number;
  user_id: number;
  amount_cents: number;
  type: CreditType;
  source_type: CreditSourceType;
  source_id: number | null;
  description: string;
  expires_at: string | null;
  stripe_event_id?: string | null;
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
  founding_sitter?: boolean;
  beta_cohort?: BetaCohort;
  pro_trial_used?: boolean;
  non_smoking_home?: boolean;
  children_in_home?: boolean;
  one_client_at_a_time?: boolean;
  lifestyle_badges?: string[];
  active_badges?: string[];
  phone?: string | null;
  share_phone_for_bookings?: boolean;
  is_mentor?: boolean;
  // Camera policy fields (Issue #373)
  children_ages?: string | null;
  has_cameras?: boolean;
  camera_locations?: string[];
  camera_policy_note?: string | null;
  camera_preference?: CameraPreference;
  avg_response_hours?: number | null;
  repeat_client_count?: number;
  completion_rate?: number | null;
  member_since?: string;
}

export type CameraPreference = 'requires' | 'prefers' | 'no_preference';

export type PetSpecies = 'dog' | 'cat' | 'bird' | 'reptile' | 'small_animal';
export type PetGender = 'male' | 'female';
export type EnergyLevel = 'low' | 'medium' | 'high';

export type ProfileType = 'sitter' | 'owner' | 'pet';

export interface Pet {
  id: number;
  owner_id: number;
  name: string;
  slug?: string;
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
  type: 'walking' | 'sitting' | 'boarding' | 'drop-in' | 'grooming' | 'meet_greet' | 'daycare';
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
  species?: string | null;
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
  nights?: number | null;
  half_days?: number | null;
  is_extended_stay?: boolean;
  custom_price_cents?: number | null;
  discount_pct?: number | null;
  discount_reason?: string | null;
}

export interface BookingBackup {
  id: number;
  booking_id: number;
  sitter_id: number;
  rank: number;
  status: 'suggested' | 'accepted' | 'declined';
  created_at: string;
  name?: string;
  slug?: string;
  avatar_url?: string | null;
  avg_rating?: number | null;
  review_count?: number;
  price_cents?: number;
}

export interface LoyaltyDiscount {
  id: number;
  sitter_id: number;
  min_bookings: number;
  discount_percent: number;
  created_at: string;
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

export type PrivateReviewFlag = 'safety_concern' | 'pet_behavior' | 'communication_issue' | 'accuracy_issue' | 'cleanliness' | 'no_show_concern';

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
  hidden_at?: string | null;
  hidden_by?: number | null;
  private_flags?: PrivateReviewFlag[];
  private_note?: string | null;
  reviewer_name?: string;
  reviewer_avatar?: string;
  reviewee_name?: string;
  reviewee_avatar?: string;
  service_type?: string;
}

export type ReviewReportReason = 'inappropriate_language' | 'spam' | 'fake_review' | 'harassment' | 'other';
export type ReviewReportStatus = 'pending' | 'dismissed' | 'actioned';

export interface ReviewReport {
  id: number;
  review_id: number;
  reporter_id: number;
  reason: ReviewReportReason;
  description?: string | null;
  status: ReviewReportStatus;
  admin_id?: number | null;
  created_at: string;
  reviewed_at?: string | null;
  reporter_name?: string;
  reporter_email?: string;
  reviewer_name?: string;
  reviewee_name?: string;
  review_rating?: number;
  review_comment?: string | null;
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

export type StrikeEventType = 'sitter_no_show' | 'sitter_cancel_24h' | 'sitter_cancel_48h' | 'meet_greet_no_show' | 'dispute_resolution';

export interface Strike {
  id: number;
  sitter_id: number;
  booking_id: number | null;
  event_type: StrikeEventType;
  strike_weight: number;
  description: string;
  created_at: string;
  expires_at: string;
}

export type ReferralStatus = 'pending' | 'completed' | 'expired';

export interface Referral {
  id: number;
  referrer_id: number;
  referred_id: number;
  referral_code: string;
  status: ReferralStatus;
  created_at: string;
  completed_at: string | null;
  credited_at: string | null;
  expires_at: string;
  referred_name?: string;
  referred_avatar?: string | null;
}

export type ExpenseCategory = 'supplies' | 'transportation' | 'insurance' | 'marketing' | 'equipment' | 'training' | 'other' | 'platform_subscription' | 'platform_fee' | 'background_check';

export interface SitterExpense {
  id: number;
  sitter_id: number;
  category: ExpenseCategory;
  amount_cents: number;
  description?: string;
  date: string;
  receipt_url?: string;
  auto_logged?: boolean;
  source_reference?: string;
  created_at: string;
}

export interface RecurringExpense {
  id: number;
  sitter_id: number;
  category: ExpenseCategory;
  amount_cents: number;
  description?: string;
  day_of_month: number;
  active: boolean;
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

export type TrendsPeriod = 'daily' | 'weekly' | 'monthly';

export interface TrendDataPoint {
  readonly period: string;
  readonly profile_views: number;
  readonly inquiries: number;
  readonly bookings_requested: number;
  readonly bookings_confirmed: number;
  readonly bookings_completed: number;
  readonly bookings_cancelled: number;
  readonly revenue_cents: number;
}

export interface ConversionFunnel {
  readonly profile_views: number;
  readonly inquiries: number;
  readonly bookings_requested: number;
  readonly bookings_confirmed: number;
  readonly bookings_completed: number;
}

export interface AnalyticsTrends {
  readonly period: TrendsPeriod;
  readonly data: ReadonlyArray<TrendDataPoint>;
  readonly funnel: ConversionFunnel;
  readonly conversion_rates: {
    readonly views_to_inquiries: number;
    readonly inquiries_to_bookings: number;
    readonly bookings_to_confirmed: number;
    readonly confirmed_to_completed: number;
  };
  readonly previous_period_totals: {
    readonly profile_views: number;
    readonly inquiries: number;
    readonly bookings_requested: number;
    readonly bookings_completed: number;
    readonly revenue_cents: number;
  };
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

export type OwnerConsentStatus = 'pending' | 'approved' | 'denied';
export type PostSourceType = 'manual' | 'walk_event' | 'chat' | 'care_update';

export interface SitterPost {
  id: number;
  sitter_id: number;
  content?: string;
  photo_url?: string;
  video_url?: string;
  booking_id?: number;
  walk_event_id?: number;
  post_type: SitterPostType;
  owner_consent_status?: OwnerConsentStatus;
  source_type?: PostSourceType;
  owner_id?: number;
  created_at: string;
}

// Universal posts (#475)
export type PostType = 'update' | 'walk_photo' | 'walk_video' | 'care_update';
export type PostDestinationType = 'profile' | 'pet' | 'space';

export interface Post {
  id: number;
  author_id: number;
  content?: string;
  photo_url?: string;
  video_url?: string;
  post_type: PostType;
  booking_id?: number;
  walk_event_id?: number;
  owner_consent_status?: OwnerConsentStatus;
  source_type?: PostSourceType;
  consent_owner_id?: number;
  created_at: string;
  // Joined fields
  author_name?: string;
  author_avatar_url?: string;
  like_count?: number;
  comment_count?: number;
  user_liked?: boolean;
  destinations?: PostDestination[];
  pet_tags?: PostPetTag[];
}

export interface PostDestination {
  id: number;
  post_id: number;
  destination_type: PostDestinationType;
  destination_id: number;
  destination_name?: string;
}

export type PostDestinationInput = Pick<PostDestination, 'destination_type' | 'destination_id'>;

export interface PostPetTag {
  post_id: number;
  pet_id: number;
  pet_name?: string;
  pet_slug?: string;
  pet_species?: string;
}

export interface PostComment {
  id: number;
  post_id: number;
  author_id: number;
  content: string;
  created_at: string;
  author_name?: string;
  author_avatar_url?: string;
}

export type CampaignType = 'holiday' | 'marketing';
export type CampaignAudience = 'all_clients' | 'recent_clients' | 'specific_clients';
export type CampaignStatus = 'draft' | 'sent' | 'cancelled';

export interface Campaign {
  readonly id: number;
  readonly sitter_id: number;
  readonly type: CampaignType;
  readonly subject: string;
  readonly body: string;
  readonly audience: CampaignAudience;
  readonly specific_client_ids?: number[] | null;
  readonly status: CampaignStatus;
  readonly recipient_count: number;
  readonly open_count: number;
  readonly click_count: number;
  readonly discount_code?: string | null;
  readonly discount_percent?: number | null;
  readonly holiday_name?: string | null;
  readonly sent_at: string | null;
  readonly created_at: string;
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

export interface InsightFactor {
  key: string;
  label: string;
  status: 'good' | 'warning' | 'critical';
  value: string;
  detail: string;
}

export interface Recommendation {
  priority: number;
  action: string;
  impact: 'high' | 'medium' | 'low';
}

export interface BookingInsights {
  profile_completeness_pct: number;
  factors: InsightFactor[];
  recommendations: Recommendation[];
  booking_trend: 'up' | 'down' | 'stable' | 'new';
}

// --- Lost Pet Alerts ---

export type LostPetAlertStatus = 'active' | 'found' | 'cancelled';

export interface LostPetAlert {
  id: number;
  pet_id: number;
  owner_id: number;
  status: LostPetAlertStatus;
  description: string;
  last_seen_lat: number;
  last_seen_lng: number;
  last_seen_at: string;
  search_radius_miles: number;
  photo_url?: string | null;
  contact_phone?: string | null;
  created_at: string;
  resolved_at?: string | null;
  pet_name?: string;
  pet_species?: string;
  pet_breed?: string;
  pet_photo_url?: string | null;
  owner_name?: string;
  owner_avatar?: string | null;
  notified_sitter_count?: number;
}

// --- Emergency Contact ---

export interface EmergencyContact {
  name: string | null;
  phone: string | null;
  relationship: string | null;
}

// --- Ban Actions & Appeals ---

export type BanActionType = 'warning' | 'suspension' | 'ban';
export type BanReason = 'safety_violation' | 'fraud' | 'policy_violation' | 'abuse' | 'inactivity' | 'other';
export type BanAppealStatus = 'pending' | 'approved' | 'denied';

export interface BanAction {
  id: number;
  user_id: number;
  action_type: BanActionType;
  reason: BanReason;
  description: string;
  issued_by: number;
  issued_at: string;
  expires_at: string | null;
  issued_by_name?: string;
}

export interface BanAppeal {
  id: number;
  user_id: number;
  ban_action_id: number;
  reason: string;
  status: BanAppealStatus;
  admin_response: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
  user_name?: string;
  user_email?: string;
  action_type?: BanActionType;
  ban_reason?: BanReason;
  ban_description?: string;
}

// Community spaces (#479)
export type SpaceType = 'sitter_only' | 'owner_only' | 'everyone' | 'local';

export interface CommunitySpace {
  id: number;
  name: string;
  slug: string;
  description?: string;
  sort_order: number;
  space_type: SpaceType;
  role_gate?: string[];
  emoji?: string;
  member_count: number;
  active: boolean;
  created_at: string;
  // Joined
  thread_count?: number;
  latest_activity?: string;
}

export interface ForumReaction {
  id: number;
  thread_id?: number;
  reply_id?: number;
  user_id: number;
  emoji: string;
  created_at: string;
}
