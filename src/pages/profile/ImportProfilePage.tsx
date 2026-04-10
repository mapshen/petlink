import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useProfilePath } from '../../hooks/useProfilePath';
import { API_BASE } from '../../config';
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, Star, ExternalLink } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import type { ScrapedProfile } from '../../types';

type Step = 'url' | 'preview' | 'verify' | 'confirm' | 'done';

export default function ImportProfilePage() {
  const { user, token, loading: authLoading } = useAuth();
  const profilePath = useProfilePath();
  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScrapedProfile | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [scrapedBio, setScrapedBio] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (authLoading) return <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" /><span className="sr-only">Loading...</span></div>;
  if (!user) return <Navigate to="/login" replace />;

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/import/preview`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to preview profile');
      }
      const data = await res.json();
      setPreview(data.profile);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleStartVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/import/start-verification`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start verification');
      }
      const data = await res.json();
      setProfileId(data.profile.id);
      setVerificationCode(data.verification_code);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification setup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/import/verify`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ profile_id: profileId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Verification failed');
      }
      const data = await res.json();
      if (data.verified) {
        setStep('confirm');
      } else {
        setError('Verification code not found in your Rover bio. Please make sure you added it and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification check failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/import/confirm`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ profile_id: profileId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Import failed');
      }
      const data = await res.json();
      setImportedCount(data.imported_count);
      if (data.scraped_profile?.bio) {
        setScrapedBio(data.scraped_profile.bio);
      }
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (verificationCode) {
      navigator.clipboard.writeText(verificationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link to={profilePath} className="text-sm text-stone-500 hover:text-emerald-600 flex items-center gap-1 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Profile
      </Link>

      <h1 className="text-2xl font-bold text-stone-900 mb-2">Import Profile from Rover</h1>
      <p className="text-stone-500 mb-8">Bring your reviews and reputation from Rover to PetLink.</p>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Enter URL */}
      {step === 'url' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">Enter your Rover profile URL</h2>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.rover.com/members/your-username/"
              className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <Button onClick={handlePreview} disabled={!url || loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              Preview Profile
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && preview && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">Preview: {preview.name}</h2>
            {preview.bio && <p className="text-sm text-stone-600">{preview.bio.slice(0, 200)}{preview.bio.length > 200 ? '...' : ''}</p>}
            <div className="flex items-center gap-4 text-sm text-stone-600">
              <span className="flex items-center gap-1"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {preview.rating}</span>
              <span>{preview.reviewCount} reviews</span>
            </div>
            {preview.reviews.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {preview.reviews.slice(0, 3).map((r, i) => (
                  <div key={i} className="p-3 bg-stone-50 rounded-lg text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-stone-900">{r.reviewerName}</span>
                      <span className="text-xs text-stone-400">{r.date}</span>
                    </div>
                    <p className="text-stone-600">{r.comment}</p>
                  </div>
                ))}
                {preview.reviews.length > 3 && (
                  <p className="text-xs text-stone-400">+ {preview.reviews.length - 3} more reviews</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('url')}>Back</Button>
              <Button onClick={handleStartVerification} disabled={loading} className="flex-grow">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Looks correct, continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Verify Ownership */}
      {step === 'verify' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">Verify Ownership</h2>
            <p className="text-sm text-stone-600">Add this code to your Rover profile bio to prove you own the account:</p>
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <code className="font-mono text-lg font-bold text-emerald-700 flex-grow">{verificationCode}</code>
              <Button variant="ghost" size="sm" onClick={copyCode}>
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <ol className="text-sm text-stone-600 space-y-1 list-decimal list-inside">
              <li>Go to your Rover profile and edit your bio</li>
              <li>Add the code above anywhere in your bio</li>
              <li>Save your Rover profile</li>
              <li>Come back here and click &quot;Verify&quot;</li>
            </ol>
            <p className="text-xs text-stone-400">You can remove the code from your Rover bio after verification.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('preview')}>Back</Button>
              <Button onClick={handleVerify} disabled={loading} className="flex-grow">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                I&apos;ve added the code — Verify
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Confirm Import */}
      {step === 'confirm' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <Check className="w-5 h-5" />
              <span className="font-semibold">Ownership Verified!</span>
            </div>
            <p className="text-sm text-stone-600">
              Ready to import {preview?.reviewCount ?? 0} reviews from Rover to your PetLink profile.
            </p>
            <p className="text-xs text-stone-400">Imported reviews will be displayed with an &quot;Imported from Rover&quot; badge.</p>
            <Button onClick={handleConfirm} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
              Import Reviews
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Done */}
      {step === 'done' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-stone-900">Import Complete!</h2>
              <p className="text-stone-600">{importedCount} reviews imported from Rover.</p>
              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 mt-2">
                <ExternalLink className="w-3 h-3 mr-1" /> Imported from Rover
              </Badge>
            </div>

            {scrapedBio && (
              <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 text-left">
                <p className="text-sm font-medium text-stone-700 mb-2">Use your Rover bio on PetLink?</p>
                <p className="text-sm text-stone-600 mb-3 line-clamp-4">{scrapedBio}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API_BASE}/import/apply-profile`, {
                          method: 'POST',
                          headers: getAuthHeaders(token),
                          body: JSON.stringify({ profile_id: profileId }),
                        });
                        if (!res.ok) throw new Error('Failed to apply');
                        setScrapedBio(null);
                      } catch {
                        setError('Failed to apply profile data.');
                      }
                    }}
                  >
                    Apply Bio
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setScrapedBio(null)}>
                    Skip
                  </Button>
                </div>
              </div>
            )}

            <div className="pt-2 text-center">
              <Link to={profilePath}>
                <Button>View Your Profile</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
