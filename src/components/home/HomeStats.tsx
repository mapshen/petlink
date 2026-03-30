import React from 'react';
import { Calendar, Activity, PawPrint, Heart, DollarSign, Star, Clock } from 'lucide-react';
import type { OwnerStats, SitterStats } from '../../hooks/useHomeStats';

interface StatCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly subtitle: string;
  readonly icon: React.ReactNode;
  readonly color: string;
}

function StatCard({ label, value, subtitle, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-100">
      <div className="text-xs text-stone-400 font-semibold uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</div>
      <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>
    </div>
  );
}

function formatHours(hours: number | null): string {
  if (hours === null) return '--';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${Math.round(hours)}h`;
}

export function OwnerStatsRow({ stats }: { readonly stats: OwnerStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Upcoming"
        value={stats.upcomingBookings}
        subtitle="bookings this week"
        icon={<Calendar className="w-4 h-4" />}
        color="text-emerald-600"
      />
      <StatCard
        label="In Progress"
        value={stats.inProgressBookings}
        subtitle="active right now"
        icon={<Activity className="w-4 h-4" />}
        color="text-blue-600"
      />
      <StatCard
        label="My Pets"
        value={stats.petCount}
        subtitle="registered"
        icon={<PawPrint className="w-4 h-4" />}
        color="text-stone-900"
      />
      <StatCard
        label="Favorites"
        value={stats.favoriteSitters}
        subtitle="saved sitters"
        icon={<Heart className="w-4 h-4" />}
        color="text-amber-500"
      />
    </div>
  );
}

export function SitterStatsRow({ stats }: { readonly stats: SitterStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Revenue"
        value={`$${stats.revenueThisMonth.toLocaleString()}`}
        subtitle="this month"
        icon={<DollarSign className="w-4 h-4" />}
        color="text-emerald-600"
      />
      <StatCard
        label="Upcoming"
        value={stats.upcomingBookings}
        subtitle="bookings this week"
        icon={<Calendar className="w-4 h-4" />}
        color="text-blue-600"
      />
      <StatCard
        label="Rating"
        value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '--'}
        subtitle={stats.reviewCount > 0 ? `from ${stats.reviewCount} reviews` : 'no reviews yet'}
        icon={<Star className="w-4 h-4" />}
        color="text-amber-500"
      />
      <StatCard
        label="Response"
        value={formatHours(stats.avgResponseHours)}
        subtitle="avg response time"
        icon={<Clock className="w-4 h-4" />}
        color="text-stone-900"
      />
    </div>
  );
}
