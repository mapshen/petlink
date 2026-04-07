import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { MessageSquare, Loader2, ChevronRight } from 'lucide-react';

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  thread_count: number;
}

export default function ForumPage() {
  useDocumentTitle('Sitter Forum');
  const { token } = useAuth();
  const [categories, setCategories] = useState<ForumCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/forum/categories`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load forum');
        return;
      }
      const data = await res.json();
      setCategories(data.categories);
    } catch {
      setError('Failed to load forum');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-emerald-600" />
          Sitter Forum
        </h1>
        <p className="text-stone-500 mt-1">Connect with fellow sitters, share tips, and ask questions</p>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            to={`/forum/${cat.slug}`}
            className="block bg-white rounded-2xl shadow-sm border border-stone-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-stone-900">{cat.name}</h2>
                <p className="text-sm text-stone-500 mt-0.5">{cat.description}</p>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <span className="text-sm text-stone-400">
                  {cat.thread_count} {cat.thread_count === 1 ? 'thread' : 'threads'}
                </span>
                <ChevronRight className="h-5 w-5 text-stone-300" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
