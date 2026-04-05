import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useOnboardingStatus } from '../../hooks/useOnboardingStatus';
import OnboardingProgress from '../../components/onboarding/OnboardingProgress';
import { useImageUpload } from '../../hooks/useImageUpload';
import { Service, SitterReference } from '../../types';
import { formatCents, dollarsToCents } from '../../lib/money';
import {
  Camera, Loader2, AlertCircle, ShieldCheck, CheckCircle, PartyPopper,
  ChevronRight, ChevronLeft, SkipForward, Save,
} from 'lucide-react';
import { API_BASE } from '../../config';

const STEPS = ['Profile', 'Services', 'Photos', 'Verification', 'References', 'Submit', 'Done'];

const STEP_TIPS: Record<number, { tip: string; time: string }> = {
  0: { tip: 'Sitters with a bio get 2x more profile views.', time: '~2 min' },
  1: { tip: 'Set competitive prices — you can always adjust later.', time: '~2 min' },
  2: { tip: 'Sitters with photos get 3x more booking requests.', time: '~1 min' },
  3: { tip: 'Verified sitters earn 40% more on average.', time: '~3 min' },
  4: { tip: 'Sitters with references get approved 2x faster.', time: '~3 min' },
};

const SERVICE_TYPES = [
  { value: 'walking', label: 'Pet Walking', icon: '🚶' },
  { value: 'sitting', label: 'House Sitting', icon: '🏠' },
  { value: 'drop-in', label: 'Drop-in Visit', icon: '👋' },
  { value: 'daycare', label: 'Daycare', icon: '🏠' },
  { value: 'grooming', label: 'Grooming', icon: '✂️' },
] as const;

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, token, updateUser, loading: authLoading } = useAuth();
  const onboarding = useOnboardingStatus();
  const [step, setStep] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Profile step state
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');

  // Services step state
  const [services, setServices] = useState<Service[]>([]);
  const [serviceType, setServiceType] = useState('walking');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');

  // Photos step state
  const [avatarUrl, setAvatarUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error: uploadError, upload, clearError } = useImageUpload(token);

  // References step state
  const [references, setReferences] = useState<SitterReference[]>([]);
  const [refName, setRefName] = useState('');
  const [refEmail, setRefEmail] = useState('');
  const [refTab, setRefTab] = useState<'invite' | 'import'>('invite');
  // Manual import state
  const [importPlatform, setImportPlatform] = useState('rover');
  const [importReviewer, setImportReviewer] = useState('');
  const [importRating, setImportRating] = useState('5');
  const [importComment, setImportComment] = useState('');

  // Shared state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect non-sitter users
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    if (!user.roles?.includes('sitter')) { navigate('/home'); return; }
  }, [user, authLoading, navigate]);

  // Record onboarding start (idempotent — only sets once)
  useEffect(() => {
    if (!user || !token) return;
    fetch(`${API_BASE}/users/me/onboarding-started`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    }).catch(() => {});
  }, [user, token]);

  // Initialize form state from user data + determine starting step
  useEffect(() => {
    if (onboarding.loading || initialized || !user) return;

    setName(user.name);
    setBio(user.bio || '');
    setAvatarUrl(user.avatar_url || '');
    setServices(onboarding.services);

    // Start at first incomplete step
    if (!onboarding.hasProfile) setStep(0);
    else if (!onboarding.hasServices) setStep(1);
    else if (!onboarding.hasPhoto) setStep(2);
    else if (!onboarding.hasVerification) setStep(3);
    else if (user.approval_status === 'onboarding') setStep(4); // References
    else setStep(6); // Done

    setInitialized(true);
  }, [onboarding.loading, initialized, user, onboarding]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearError();
    const url = await upload(file, 'avatars');
    if (url) setAvatarUrl(url);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ name, bio, avatar_url: avatarUrl || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save profile');
      }
      const data = await res.json();
      updateUser(data.user);
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const addService = async () => {
    if (!servicePrice || Number(servicePrice) < 1) {
      setError('Price must be at least $1');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/services`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          type: serviceType,
          price_cents: dollarsToCents(Number(servicePrice)),
          description: serviceDesc || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add service');
      }
      const data = await res.json();
      setServices((prev) => [...prev, data.service]);
      setServicePrice('');
      setServiceDesc('');
      // Auto-select next available type
      const usedTypes = new Set([...services.map((s) => s.type), data.service.type]);
      const nextType = SERVICE_TYPES.find((t) => !usedTypes.has(t.value))?.value || 'walking';
      setServiceType(nextType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add service');
    } finally {
      setSaving(false);
    }
  };

  const savePhoto = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ name: user?.name, bio: user?.bio || null, avatar_url: avatarUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save photo');
      }
      const data = await res.json();
      updateUser(data.user);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save photo');
    } finally {
      setSaving(false);
    }
  };

  const startVerification = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/verification/start`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start verification');
      }
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start verification');
    } finally {
      setSaving(false);
    }
  };

  const sendReferenceInvite = async () => {
    if (!refName.trim() || !refEmail.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/references/invite`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: refName.trim(), client_email: refEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send invite');
      }
      const data = await res.json();
      setReferences((prev) => [...prev, data.reference]);
      setRefName('');
      setRefEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSaving(false);
    }
  };

  const addManualImport = async () => {
    if (!importReviewer.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/import/manual`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: importPlatform,
          reviewer_name: importReviewer.trim(),
          rating: Number(importRating),
          comment: importComment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to import review');
      }
      setImportReviewer('');
      setImportComment('');
      setImportRating('5');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import review');
    } finally {
      setSaving(false);
    }
  };

  const submitApplication = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users/me/submit-application`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit application');
      }
      const data = await res.json();
      updateUser(data.user);
      setStep(6);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSaving(false);
    }
  };

  if (!user || onboarding.loading || !initialized) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const availableTypes = SERVICE_TYPES.filter(
    (t) => !services.some((s) => s.type === t.value)
  );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-2">Set Up Your Sitter Profile</h1>
      <p className="text-stone-500 mb-8">Complete these steps to start getting bookings.</p>

      <OnboardingProgress currentStep={step} steps={STEPS} onStepClick={(i) => { if (i < step) setStep(i); }} />

      {STEP_TIPS[step] && (
        <div className="mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-xl text-sm">
          <span className="text-emerald-700 flex-grow">{STEP_TIPS[step].tip}</span>
          <span className="text-emerald-500 text-xs font-medium whitespace-nowrap">{STEP_TIPS[step].time}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8">
        {/* Step 0: Profile */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-stone-900">Tell us about yourself</h2>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Bio</label>
              <textarea
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell pet owners about your experience with animals, why you love pet sitting, and what makes you a great sitter..."
                className="w-full p-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div className="flex justify-between items-center">
              <button
                onClick={() => navigate('/home')}
                className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-600 transition-colors"
              >
                <Save className="w-4 h-4" />
                Save & Continue Later
              </button>
              <button
                onClick={saveProfile}
                disabled={saving || !name.trim() || !bio.trim()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Next'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Services */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-stone-900">Set up your services</h2>
            <p className="text-sm text-stone-500">Add at least one service to let pet owners book you.</p>

            {/* Existing services */}
            {services.length > 0 && (
              <div className="space-y-2">
                {services.map((s) => {
                  const typeInfo = SERVICE_TYPES.find((t) => t.value === s.type);
                  return (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-2">
                        <span>{typeInfo?.icon}</span>
                        <span className="font-medium text-stone-900">{typeInfo?.label}</span>
                      </div>
                      <span className="font-bold text-emerald-600">{formatCents(s.price_cents)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add service form */}
            {availableTypes.length > 0 && (
              <div className="border border-stone-200 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Service Type</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  >
                    {availableTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Price per session ($)</label>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Description (optional)</label>
                  <textarea
                    value={serviceDesc}
                    onChange={(e) => setServiceDesc(e.target.value)}
                    placeholder="Describe what's included..."
                    rows={2}
                    className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
                <button
                  onClick={addService}
                  disabled={saving || !servicePrice}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Adding...' : 'Add Service'}
                </button>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-2 px-4 py-3 text-stone-600 hover:text-stone-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/home')}
                  className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-600 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Later
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={services.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Photos */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-stone-900">Add a profile photo</h2>
            <p className="text-sm text-stone-500">Pet owners are more likely to book sitters with a profile photo.</p>

            <div className="flex flex-col items-center gap-4 py-4">
              <div className="relative group">
                <img
                  src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=160`}
                  alt={name}
                  className="w-32 h-32 rounded-full border-4 border-emerald-50 object-cover"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {uploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-stone-400">Click to upload. JPEG, PNG, WebP or GIF. Max 5MB.</p>
              {uploading && (
                <div className="w-48 bg-stone-100 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
              {uploadError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {uploadError}
                </p>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-4 py-3 text-stone-600 hover:text-stone-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 px-4 py-3 text-stone-400 hover:text-stone-600 transition-colors text-sm"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip
                </button>
                <button
                  onClick={savePhoto}
                  disabled={saving || !avatarUrl || uploading}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Verification */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-stone-900">Verify your identity</h2>
            <p className="text-sm text-stone-500">Verified sitters get a badge on their profile and earn more trust with pet owners.</p>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-emerald-600" />
              <h3 className="font-bold text-stone-900 mb-2">Identity Verification</h3>
              <p className="text-sm text-stone-600 mb-4">
                We'll verify your identity through a quick background check. This helps keep the platform safe for pets and their owners.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-4 py-3 text-stone-600 hover:text-stone-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(4)}
                  className="inline-flex items-center gap-2 px-4 py-3 text-stone-400 hover:text-stone-600 transition-colors text-sm"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip
                </button>
                <button
                  onClick={startVerification}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Starting...' : 'Start Verification'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: References */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-stone-900">Add references (optional)</h2>
            <p className="text-sm text-stone-500">References help build trust and can speed up your approval.</p>

            {/* Tab switcher */}
            <div className="flex gap-1 bg-stone-100 rounded-xl p-1">
              <button
                onClick={() => setRefTab('invite')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${refTab === 'invite' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              >
                Invite Past Clients
              </button>
              <button
                onClick={() => setRefTab('import')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${refTab === 'import' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              >
                Import Reviews
              </button>
            </div>

            {refTab === 'invite' && (
              <div className="space-y-3">
                <p className="text-xs text-stone-400">Enter your past client's name and email. We'll send them a link to write a reference.</p>
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={refName} onChange={(e) => setRefName(e.target.value)} placeholder="Client name" className="p-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                  <input type="email" value={refEmail} onChange={(e) => setRefEmail(e.target.value)} placeholder="Client email" className="p-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onClick={sendReferenceInvite} disabled={saving || !refName.trim() || !refEmail.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? 'Sending...' : 'Send Invite'}
                </button>
                {references.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-stone-600">Sent invites:</p>
                    {references.map((ref) => (
                      <div key={ref.id} className="flex items-center justify-between p-2 bg-stone-50 rounded-lg text-sm">
                        <span>{ref.client_name} ({ref.client_email})</span>
                        <span className={`text-xs font-medium ${ref.status === 'completed' ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {ref.status === 'completed' ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {refTab === 'import' && (
              <div className="space-y-3">
                <p className="text-xs text-stone-400">Manually add reviews you received on other platforms. No scraping — just copy the details.</p>
                <div className="grid grid-cols-2 gap-3">
                  <select value={importPlatform} onChange={(e) => setImportPlatform(e.target.value)} className="p-3 border border-stone-200 rounded-xl text-sm">
                    <option value="rover">Rover</option>
                    <option value="wag">Wag</option>
                    <option value="care_com">Care.com</option>
                    <option value="other">Other</option>
                  </select>
                  <input type="text" value={importReviewer} onChange={(e) => setImportReviewer(e.target.value)} placeholder="Reviewer name" className="p-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="flex gap-3 items-center">
                  <label className="text-sm text-stone-600">Rating:</label>
                  <select value={importRating} onChange={(e) => setImportRating(e.target.value)} className="p-2 border border-stone-200 rounded-lg text-sm">
                    {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <textarea value={importComment} onChange={(e) => setImportComment(e.target.value)} placeholder="Review text (optional)" rows={2} className="w-full p-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                <button onClick={addManualImport} disabled={saving || !importReviewer.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add Review'}
                </button>
              </div>
            )}

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(3)} className="inline-flex items-center gap-2 px-4 py-3 text-stone-600 hover:text-stone-900 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button onClick={() => setStep(5)} className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Submit Application */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-stone-900">Review & Submit</h2>
            <p className="text-sm text-stone-500">Check your progress below. Profile and Services are required to submit.</p>

            <div className="space-y-2">
              {[
                { label: 'Profile (name & bio)', done: onboarding.hasProfile, required: true },
                { label: 'At least one service', done: onboarding.hasServices, required: true },
                { label: 'Profile photo', done: onboarding.hasPhoto, required: false },
                { label: 'Identity verification', done: onboarding.hasVerification, required: false },
              ].map((item) => (
                <div key={item.label} className={`flex items-center gap-3 p-3 rounded-xl ${item.done ? 'bg-emerald-50 border border-emerald-200' : 'bg-stone-50 border border-stone-200'}`}>
                  <CheckCircle className={`w-5 h-5 ${item.done ? 'text-emerald-600' : 'text-stone-300'}`} />
                  <span className={`text-sm ${item.done ? 'text-emerald-800 font-medium' : 'text-stone-500'}`}>{item.label}</span>
                  {item.required && !item.done && <span className="text-xs text-red-500 ml-auto">Required</span>}
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(4)} className="inline-flex items-center gap-2 px-4 py-3 text-stone-600 hover:text-stone-900 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={submitApplication}
                disabled={saving || !onboarding.hasProfile || !onboarding.hasServices}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Submitting...' : 'Submit Application'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Done */}
        {step === 6 && (
          <div className="text-center space-y-5 py-4">
            <PartyPopper className="w-16 h-16 mx-auto text-emerald-500" />
            <h2 className="text-2xl font-bold text-stone-900">Application Submitted!</h2>
            <p className="text-stone-600 max-w-md mx-auto">
              We'll review your profile and notify you once you're approved. You can continue editing your profile while you wait.
            </p>

            <button
              onClick={() => navigate('/home')}
              className="inline-flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
            >
              Go to Home
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
