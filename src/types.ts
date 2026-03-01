export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';

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
  cancellation_policy?: CancellationPolicy;
}

export interface Pet {
  id: number;
  owner_id: number;
  name: string;
  breed?: string;
  age?: number;
  weight?: number;
  medical_history?: string;
  photo_url?: string;
}

export interface Service {
  id: number;
  sitter_id: number;
  type: 'walking' | 'sitting' | 'drop-in' | 'grooming' | 'meet_greet';
  price: number;
  description?: string;
  additional_pet_price?: number;
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
  event_type: 'start' | 'pee' | 'poop' | 'photo' | 'end';
  lat?: number;
  lng?: number;
  note?: string;
  photo_url?: string;
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

export interface SitterPhoto {
  id: number;
  sitter_id: number;
  photo_url: string;
  caption: string;
  sort_order: number;
  created_at: string;
}
