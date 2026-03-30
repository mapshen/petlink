import React, { useState, useEffect } from 'react';
import { BookingCareTask } from '../../types';
import { ClipboardCheck, CheckCircle2, Circle } from 'lucide-react';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';

const CATEGORY_ICONS: Record<string, string> = {
  feeding: '🍽️',
  medication: '💊',
  exercise: '🏃',
  grooming: '✂️',
  behavioral: '🧠',
  litter_box: '🪣',
  cage_cleaning: '🧹',
  habitat_maintenance: '🌡️',
  other: '📝',
};

interface Props {
  bookingId: number;
  token: string | null;
  isSitter: boolean;
}

export default function CareTasksChecklist({ bookingId, token, isSitter }: Props) {
  const [tasks, setTasks] = useState<BookingCareTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [bookingId]);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/care-tasks`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (task: BookingCareTask) => {
    if (!isSitter) return;
    setTogglingId(task.id);
    const action = task.completed ? 'uncomplete' : 'complete';
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/care-tasks/${task.id}/${action}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => prev.map(t => t.id === task.id ? { ...data.task, pet_name: t.pet_name } : t));
      }
    } catch {
      // Silently fail
    } finally {
      setTogglingId(null);
    }
  };

  if (loading || tasks.length === 0) return null;

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;

  // Group by pet
  const byPet = new Map<number, { name: string; tasks: BookingCareTask[] }>();
  for (const task of tasks) {
    const existing = byPet.get(task.pet_id);
    if (existing) {
      existing.tasks.push(task);
    } else {
      byPet.set(task.pet_id, { name: task.pet_name || `Pet #${task.pet_id}`, tasks: [task] });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-stone-900 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-emerald-600" />
          Care Tasks
        </h3>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          completedCount === totalCount
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-stone-100 text-stone-600'
        }`}>
          {completedCount}/{totalCount} completed
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-stone-100 rounded-full h-2 mb-4">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>

      <div className="space-y-4">
        {Array.from(byPet.entries()).map(([petId, { name, tasks: petTasks }]) => (
          <div key={petId}>
            <h4 className="text-sm font-medium text-stone-700 mb-2">{name}</h4>
            <div className="space-y-1.5">
              {petTasks.map(task => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => toggleTask(task)}
                  disabled={!isSitter || togglingId === task.id}
                  className={`w-full text-left flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                    isSitter ? 'hover:bg-stone-50 cursor-pointer' : 'cursor-default'
                  } ${task.completed ? 'opacity-60' : ''}`}
                >
                  <span className="flex-shrink-0 mt-0.5">
                    {task.completed ? (
                      <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                    ) : (
                      <Circle className="w-4.5 h-4.5 text-stone-300" />
                    )}
                  </span>
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{CATEGORY_ICONS[task.category] || '📝'}</span>
                      <span className={`text-sm font-medium ${task.completed ? 'line-through text-stone-400' : 'text-stone-900'}`}>
                        {task.description}
                      </span>
                      {task.time && (
                        <span className="text-xs text-stone-400 flex-shrink-0">{task.time}</span>
                      )}
                    </div>
                    {task.notes && (
                      <p className="text-xs text-stone-400 mt-0.5">{task.notes}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
