import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save, Check, ShieldCheck } from 'lucide-react';
import { API_BASE } from '../../config';
import type { CancellationPolicy } from '../../types';

const CANCELLATION_POLICIES: { value: CancellationPolicy; label: string; description: string }[] = [
  { value: 'flexible', label: 'Flexible', description: 'Full refund if cancelled at least 24 hours before the booking.' },
  { value: 'moderate', label: 'Moderate', description: '50% refund if cancelled at least 48 hours before the booking.' },
  { value: 'strict', label: 'Strict', description: 'No refund within 7 days of the booking.' },
];

export default function PoliciesTab() {
  const { user, token, updateUser } = useAuth();

  const [policy, setPolicy] = useState<CancellationPolicy>('flexible');
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);
  const [houseRules, setHouseRules] = useState('');
  const [emergencyProcedures, setEmergencyProcedures] = useState('');
  const [hasInsurance, setHasInsurance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setPolicy(user.cancellation_policy || 'flexible');
    setHouseRules(user.house_rules || '');
    setEmergencyProcedures(user.emergency_procedures || '');
    setHasInsurance(user.has_insurance || false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchPolicy = async () => {
      try {
        const res = await fetch(`${API_BASE}/cancellation-policy`, { headers: getAuthHeaders(token) });
        if (res.ok) {
          const data = await res.json();
          setPolicy(data.cancellation_policy);
        }
      } catch {
        // Non-critical
      }
    };
    fetchPolicy();
  }, [user, token]);

  const savePolicy = async (newPolicy: CancellationPolicy) => {
    const previous = policy;
    setPolicy(newPolicy);
    setPolicySaving(true);
    setPolicySaved(false);
    try {
      const res = await fetch(`${API_BASE}/cancellation-policy`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ cancellation_policy: newPolicy }),
      });
      if (!res.ok) throw new Error('Failed to save policy');
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 2000);
    } catch {
      setPolicy(previous);
      setMessage('Failed to save cancellation policy.');
    } finally {
      setPolicySaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          name: user?.name,
          bio: user?.bio || null,
          avatar_url: user?.avatar_url || null,
          house_rules: houseRules || null,
          emergency_procedures: emergencyProcedures || null,
          has_insurance: hasInsurance,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }
      const data = await res.json();
      updateUser(data.user);
      setMessage('Policies updated successfully');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold text-stone-900">Policies</h2>

      {/* Cancellation Policy */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-stone-900">Cancellation Policy</h3>
          {policySaving && <span className="text-xs text-stone-400">Saving...</span>}
          {policySaved && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
        </div>
        <div className="space-y-3">
          {CANCELLATION_POLICIES.map((p) => (
            <button
              key={p.value}
              onClick={() => savePolicy(p.value)}
              disabled={policySaving}
              className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                policy === p.value
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-stone-200 hover:border-stone-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-stone-900">{p.label}</span>
                  <p className="text-sm text-stone-500 mt-1">{p.description}</p>
                </div>
                {policy === p.value && (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* House Rules, Emergency, Insurance */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">House Rules</label>
          <textarea
            rows={3}
            value={houseRules}
            onChange={(e) => setHouseRules(e.target.value)}
            placeholder="E.g., pets must be up to date on vaccinations, no aggressive dogs..."
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm resize-vertical"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Emergency Procedures</label>
          <textarea
            rows={3}
            value={emergencyProcedures}
            onChange={(e) => setEmergencyProcedures(e.target.value)}
            placeholder="What you do in an emergency situation..."
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm resize-vertical"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasInsurance}
              onChange={(e) => setHasInsurance(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            <span className="text-sm text-stone-700">I carry pet sitter insurance</span>
          </label>
        </div>

        {message && (
          <div className={`text-sm text-center p-2 rounded-lg ${
            message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Policies'}
        </button>
      </form>
    </div>
  );
}
