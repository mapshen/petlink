import React, { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Service } from '../types';
import { Plus, Pencil, Trash2, DollarSign, Save, X, ShieldCheck, Check } from 'lucide-react';
import { API_BASE } from '../config';
import type { CancellationPolicy } from '../types';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const SERVICE_TYPES = [
  { value: 'walking', label: 'Dog Walking', icon: '🚶' },
  { value: 'sitting', label: 'House Sitting', icon: '🏠' },
  { value: 'drop-in', label: 'Drop-in Visit', icon: '👋' },
  { value: 'grooming', label: 'Grooming', icon: '✂️' },
  { value: 'meet_greet', label: 'Meet & Greet', icon: '🤝' },
] as const;

interface ServiceForm {
  type: string;
  price: string;
  description: string;
  additional_pet_price: string;
}

const EMPTY_FORM: ServiceForm = { type: 'walking', price: '', description: '', additional_pet_price: '' };

export default function Services() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [policy, setPolicy] = useState<CancellationPolicy>('flexible');
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.role === 'owner') { navigate('/dashboard'); return; }
    fetchServices();
    fetchPolicy();
  }, [user, navigate]);

  const fetchServices = async () => {
    try {
      const res = await fetch(`${API_BASE}/services/me`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error('Failed to load services');
      const data = await res.json();
      setServices(data.services);
    } catch {
      setError('Failed to load services.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPolicy = async () => {
    try {
      const res = await fetch(`${API_BASE}/cancellation-policy`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setPolicy(data.cancellation_policy);
      }
    } catch {
      // Non-critical — default to flexible
    }
  };

  const savePolicy = async (newPolicy: CancellationPolicy) => {
    const previousPolicy = policy;
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
      setPolicy(previousPolicy);
      setError('Failed to save cancellation policy.');
    } finally {
      setPolicySaving(false);
    }
  };

  const handleAdd = async () => {
    const isMeetGreet = form.type === 'meet_greet';
    const price = isMeetGreet ? 0 : Number(form.price);
    if (!isMeetGreet && (!form.price || price < 1)) { setError('Price must be at least $1'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/services`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          type: form.type,
          price,
          description: form.description || null,
          additional_pet_price: Number(form.additional_pet_price) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add service');
      }
      const data = await res.json();
      setServices((prev) => [...prev, data.service]);
      setShowAddForm(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add service');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    const isMeetGreetEdit = form.type === 'meet_greet';
    const editPrice = isMeetGreetEdit ? 0 : Number(form.price);
    if (!editingId || (!isMeetGreetEdit && (!form.price || editPrice < 1))) { setError('Price must be at least $1'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/services/${editingId}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          type: form.type,
          price: editPrice,
          description: form.description || null,
          additional_pet_price: Number(form.additional_pet_price) || 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update service');
      }
      const data = await res.json();
      setServices((prev) => prev.map((s) => (s.id === editingId ? data.service : s)));
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update service');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/services/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to delete service');
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Failed to delete service.');
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (service: Service) => {
    setEditingId(service.id);
    setShowAddForm(false);
    setForm({
      type: service.type,
      price: service.price.toString(),
      description: service.description || '',
      additional_pet_price: (service.additional_pet_price || 0).toString(),
    });
  };

  const cancelForm = () => {
    setEditingId(null);
    setShowAddForm(false);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const startAdd = () => {
    setEditingId(null);
    const usedTypes = new Set(services.map((s) => s.type));
    const availableType = SERVICE_TYPES.find((t) => !usedTypes.has(t.value))?.value || 'walking';
    setForm({ ...EMPTY_FORM, type: availableType });
    setShowAddForm(true);
  };

  const availableTypesForAdd = SERVICE_TYPES.filter(
    (t) => !services.some((s) => s.type === t.value)
  );

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-stone-900">My Services</h1>
        {availableTypesForAdd.length > 0 && !showAddForm && !editingId && (
          <button
            onClick={startAdd}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-6 mb-6">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Add New Service</h2>
          <ServiceFormFields
            form={form}
            setForm={setForm}
            availableTypes={availableTypesForAdd}
            saving={saving}
            onSave={handleAdd}
            onCancel={cancelForm}
          />
        </div>
      )}

      {/* Service List */}
      <div className="space-y-4">
        {services.map((service) => {
          const typeInfo = SERVICE_TYPES.find((t) => t.value === service.type);
          const isEditing = editingId === service.id;

          return (
            <div key={service.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              {isEditing ? (
                <div className="p-6">
                  <h2 className="text-lg font-bold text-stone-900 mb-4">Edit Service</h2>
                  <ServiceFormFields
                    form={form}
                    setForm={setForm}
                    availableTypes={[...SERVICE_TYPES.filter((t) => t.value === service.type || !services.some((s) => s.type === t.value))]}
                    saving={saving}
                    onSave={handleEdit}
                    onCancel={cancelForm}
                  />
                </div>
              ) : (
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{typeInfo?.icon}</span>
                    <div>
                      <h3 className="font-bold text-stone-900">{typeInfo?.label || service.type}</h3>
                      {service.description && (
                        <p className="text-sm text-stone-500 mt-1">{service.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-xl font-bold text-emerald-600">${service.price}</span>
                      <span className="text-xs text-stone-400 block">per session</span>
                      {(service.additional_pet_price || 0) > 0 && (
                        <span className="text-xs text-stone-400 block">+${service.additional_pet_price}/extra pet</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(service)}
                        className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Edit service"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteDialogId(service.id)}
                        disabled={deletingId === service.id}
                        className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Delete service"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {services.length === 0 && !showAddForm && (
          <div className="text-center py-12 bg-stone-50 rounded-2xl">
            <DollarSign className="w-12 h-12 mx-auto mb-4 text-stone-300" />
            <p className="text-stone-500 mb-4">No services yet. Add your first service to start getting bookings.</p>
            <button
              onClick={startAdd}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Service
            </button>
          </div>
        )}
      </div>

      {/* Cancellation Policy */}
      <div className="mt-10">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h2 className="text-xl font-bold text-stone-900">Cancellation Policy</h2>
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

      <AlertDialog open={deleteDialogId !== null} onOpenChange={(open) => { if (!open) setDeleteDialogId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this service? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (deleteDialogId !== null) { handleDelete(deleteDialogId); setDeleteDialogId(null); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const CANCELLATION_POLICIES: { value: CancellationPolicy; label: string; description: string }[] = [
  { value: 'flexible', label: 'Flexible', description: 'Full refund if cancelled at least 24 hours before the booking.' },
  { value: 'moderate', label: 'Moderate', description: '50% refund if cancelled at least 48 hours before the booking.' },
  { value: 'strict', label: 'Strict', description: 'No refund within 7 days of the booking.' },
];

function ServiceFormFields({
  form,
  setForm,
  availableTypes,
  saving,
  onSave,
  onCancel,
}: {
  form: ServiceForm;
  setForm: React.Dispatch<React.SetStateAction<ServiceForm>>;
  availableTypes: readonly { value: string; label: string; icon: string }[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Service Type</label>
        <select
          value={form.type}
          onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value, ...(e.target.value === 'meet_greet' ? { price: '0' } : {}) }))}
          className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          {availableTypes.map((t) => (
            <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Price per session ($)</label>
        {form.type === 'meet_greet' ? (
          <div className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm bg-stone-50 text-emerald-700 font-medium">
            Free (Meet & Greet)
          </div>
        ) : (
          <Input
            type="number"
            min={1}
            max={9999}
            value={form.price}
            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
            placeholder="e.g. 25"
          />
        )}
      </div>

      {form.type !== 'meet_greet' && (
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Additional pet price ($)</label>
          <Input
            type="number"
            min={0}
            max={500}
            value={form.additional_pet_price}
            onChange={(e) => setForm((prev) => ({ ...prev, additional_pet_price: e.target.value }))}
            placeholder="0"
          />
          <p className="text-xs text-stone-400 mt-1">Extra charge per additional pet (first pet included in base price)</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Description (optional)</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Describe what's included in this service..."
          rows={3}
          className="resize-none"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={onSave}
          disabled={saving || (form.type !== 'meet_greet' && !form.price)}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          <X className="w-4 h-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
