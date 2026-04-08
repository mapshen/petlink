import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../config';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ConnectRefresh() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    async function refreshLink() {
      try {
        const res = await fetch(`${API_BASE}/connect/refresh-link`, {
          method: 'POST',
          headers: getAuthHeaders(token),
        });
        if (res.ok) {
          const { url } = await res.json();
          window.location.href = url;
        } else {
          setError('Failed to generate a new onboarding link. Please try again from your profile.');
        }
      } catch {
        setError('Something went wrong. Please try again from your profile.');
      }
    }
    refreshLink();
  }, [token]);

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => navigate('/profile#section-account')}
          className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          Go to Profile
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
      <p className="text-stone-600">Generating a new onboarding link...</p>
    </div>
  );
}
