import React from 'react';
import { Calendar, Activity, PawPrint, Heart, DollarSign, Star, Clock } from 'lucide-react';
import type { OwnerStats, SitterStats } from '../../hooks/homeStatsUtils';

interface StatCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly subtitle: string;
  readonly icon: React.ReactNode;
  readonly color: string;
}

function StatCard({ label, value, subtitle, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-100" aria-label={`${label}: ${value}`}>
      <div className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</div>
      <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>
    </div>
  );
}

export function OwnerStatsRow({ stats }: { readonly stats: OwnerStats }) {
  return (
    <div role="region" aria-label="Owner statistics" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Upcoming"
        value={stats.upcomingBookings}
        subtitle="upcoming bookings"
        icon={<Calendar className="w-3.5 h-3.5" />}
        color="text-emerald-600"
      />
      <StatCard
        label="In Progress"
        value={stats.inProgressBookings}
        subtitle="active right now"
        icon={<Activity className="w-3.5 h-3.5" />}
        color="text-blue-600"
      />
      <StatCard
        label="My Pets"
        value={stats.petCount}
        subtitle="registered"
        icon={<PawPrint className="w-3.5 h-3.5" />}
        color="text-stone-900"
      />
      <StatCard
        label="Favorites"
        value={stats.favoriteSitters}
        subtitle="saved sitters"
        icon={<Heart className="w-3.5 h-3.5" />}
        color="text-amber-500"
      />
    </div>
  );
}

export function SitterStatsRow({ stats }: { readonly stats: SitterStats }) {
  return (
    <div role="region" aria-label="Sitter statistics" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard
        label="Revenue"
        value={`$${stats.revenueThisMonth.toLocaleString()}`}
        subtitle="this month"
        icon={<DollarSign className="w-3.5 h-3.5" />}
        color="text-emerald-600"
      />
      <StatCard
        label="Upcoming"
        value={stats.upcomingBookings}
        subtitle="upcoming bookings"
        icon={<Calendar className="w-3.5 h-3.5" />}
        color="text-blue-600"
      />
      <StatCard
        label="Rating"
        value={stats.avgRating !== null ? stats.avgRating.toFixed(1) : '--'}
        subtitle={stats.reviewCount > 0 ? `from ${stats.reviewCount} reviews` : 'no reviews yet'}
        icon={<Star className="w-3.5 h-3.5" />}
        color="text-amber-500"
      />
      <StatCard
        label="Response"
        value={stats.avgResponseHours !== null
          ? (stats.avgResponseHours < 1
            ? `${Math.round(stats.avgResponseHours * 60)}m`
            : `${Math.round(stats.avgResponseHours)}h`)
          : '--'}
        subtitle="avg response time"
        icon={<Clock className="w-3.5 h-3.5" />}
        color="text-stone-900"
      />
    </div>
  );
}
