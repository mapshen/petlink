import React, { useEffect, useState, useMemo } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Service } from '../../types';
import { Plus, Pencil, Trash2, DollarSign, Save, X } from 'lucide-react';
import { API_BASE } from '../../config';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { getAvailableServices, getServiceLabel } from '../../shared/service-labels';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

const SERVICE_TYPE_ICONS: Record<string, string> = {
  walking: '🚶', sitting: '🏠', 'drop-in': '👋', daycare: '☀️', grooming: '✂️', meet_greet: '🤝',
};

interface ServiceDetails {
  walk_duration?: string;
  walk_style?: 'solo' | 'group';
  boarding_location?: 'sitter_home' | 'owner_home';
  pickup_available?: boolean;
  dropoff_available?: boolean;
  pickup_fee?: string;
  dropoff_fee?: string;
}

interface ServiceForm {
  type: string;
  price: string;
  description: string;
  additional_pet_price: string;
  max_pets: string;
  details: ServiceDetails;
}

const EMPTY_DETAILS: ServiceDetails = {};
const EMPTY_FORM: ServiceForm = { type: 'walking', price: '', description: '', additional_pet_price: '', max_pets: '1', details: EMPTY_DETAILS };

export default function ServicesTab() {
  const { user, token } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const acceptedSpecies = user?.accepted_species || [];
  const SERVICE_TYPES = useMemo(() => {
    const available = getAvailableServices(acceptedSpecies);
    return available.map((type) => ({
      value: type,
      label: getServiceLabel(type, acceptedSpecies),
      icon: SERVICE_TYPE_ICONS[type] || '📋',
    }));
  }, [acceptedSpecies]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<ServiceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchServices();
  }, [user]);

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

  const handleAdd = async () => {
    const isMeetGreet = form.type === 'meet_greet';
    const price = isMeetGreet ? 0 : Number(form.price);
    if (!isMeetGreet && (!form.price || price < 1)) { setError('Price must be at least $1'); return; }
    setSaving(true);
    setError(null);
    try {
      const serviceDetails = buildServiceDetails(form.details);
      const res = await fetch(`${API_BASE}/services`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          type: form.type,
          price,
          description: form.description || null,
          additional_pet_price: Number(form.additional_pet_price) || 0,
          max_pets: Number(form.max_pets) || 1,
          service_details: Object.keys(serviceDetails).length > 0 ? serviceDetails : null,
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
      const editServiceDetails = buildServiceDetails(form.details);
      const res = await fetch(`${API_BASE}/services/${editingId}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          type: form.type,
          price: editPrice,
          description: form.description || null,
          additional_pet_price: Number(form.additional_pet_price) || 0,
          max_pets: Number(form.max_pets) || 1,
          service_details: Object.keys(editServiceDetails).length > 0 ? editServiceDetails : null,
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
    const sd = (service.service_details || {}) as ServiceDetails;
    setForm({
      type: service.type,
      price: (service.price_cents / 100).toString(),
      description: service.description || '',
      additional_pet_price: ((service.additional_pet_price_cents || 0) / 100).toString(),
      max_pets: (service.max_pets || 1).toString(),
      details: {
        walk_duration: sd.walk_duration || '',
        walk_style: sd.walk_style,
        boarding_location: sd.boarding_location,
        pickup_available: sd.pickup_available,
        dropoff_available: sd.dropoff_available,
        pickup_fee: sd.pickup_fee || '',
        dropoff_fee: sd.dropoff_fee || '',
      },
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

  if (loading) return <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div><span className="sr-only">Loading...</span></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-stone-900">Services</h2>
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
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {/* Add Form */}
      {showAddForm && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6">
          <h3 className="text-sm font-bold text-stone-900 mb-4">Add New Service</h3>
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
            <div key={service.id} className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
              {isEditing ? (
                <div className="p-6">
                  <h3 className="text-sm font-bold text-stone-900 mb-4">Edit Service</h3>
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
                      <span className="text-xl font-bold text-emerald-600">{service.price_cents === 0 ? 'Free' : `$${(service.price_cents / 100).toFixed(2)}`}</span>
                      {service.price_cents > 0 && <span className="text-xs text-stone-400 block">per session</span>}
                      {(service.additional_pet_price_cents || 0) > 0 && (
                        <span className="text-xs text-stone-400 block">+${((service.additional_pet_price_cents || 0) / 100).toFixed(2)}/extra pet</span>
                      )}
                      {(service.max_pets || 1) > 1 && (
                        <span className="text-xs text-stone-400 block">Up to {service.max_pets} pets</span>
                      )}
                    </div>
                    {service.service_details && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <ServiceDetailTags details={service.service_details as ServiceDetails} />
                      </div>
                    )}
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
          <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
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
            <AlertDialogAction variant="destructive" onClick={() => { if (deleteDialogId !== null) handleDelete(deleteDialogId); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function buildServiceDetails(details: ServiceDetails): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (details.walk_duration) {
    const duration = Number(details.walk_duration);
    if (duration >= 15 && duration <= 120) result.walk_duration = duration;
  }
  if (details.walk_style) result.walk_style = details.walk_style;
  if (details.boarding_location) result.boarding_location = details.boarding_location;
  if (details.pickup_available) result.pickup_available = true;
  if (details.dropoff_available) result.dropoff_available = true;
  if (details.pickup_fee && Number(details.pickup_fee) > 0) result.pickup_fee = Number(details.pickup_fee);
  if (details.dropoff_fee && Number(details.dropoff_fee) > 0) result.dropoff_fee = Number(details.dropoff_fee);
  return result;
}

function ServiceDetailTags({ details }: { readonly details: ServiceDetails }) {
  const tags: string[] = [];
  if (details.walk_duration) tags.push(`${details.walk_duration} min session`);
  if (details.walk_style === 'solo') tags.push('One-on-one');
  if (details.walk_style === 'group') tags.push('Multi-pet');
  if (details.boarding_location === 'sitter_home') tags.push("At sitter's home");
  if (details.boarding_location === 'owner_home') tags.push("At owner's home");
  if (details.pickup_available) tags.push(details.pickup_fee ? `Pickup: $${details.pickup_fee}` : 'Free pickup');
  if (details.dropoff_available) tags.push(details.dropoff_fee ? `Dropoff: $${details.dropoff_fee}` : 'Free dropoff');
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} className="bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded-md">{tag}</span>
      ))}
    </>
  );
}

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
          onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value, ...(e.target.value === 'meet_greet' ? { price: '0' } : prev.type === 'meet_greet' ? { price: '' } : {}) }))}
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
        <>
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
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Max pets at once</label>
            <Input
              type="number"
              min={1}
              max={20}
              value={form.max_pets}
              onChange={(e) => setForm((prev) => ({ ...prev, max_pets: e.target.value }))}
              placeholder="1"
            />
            <p className="text-xs text-stone-400 mt-1">Maximum number of pets you can handle per booking</p>
          </div>
        </>
      )}

      {/* Service-specific details */}
      {form.type === 'walking' && (
        <div className="space-y-4 border-t border-stone-200 pt-4">
          <h4 className="text-sm font-semibold text-stone-700">Session Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Duration (minutes)</label>
              <Input
                type="number"
                min={15}
                max={120}
                value={form.details.walk_duration || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, details: { ...prev.details, walk_duration: e.target.value } }))}
                placeholder="30"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Service style</label>
              <select
                value={form.details.walk_style || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, details: { ...prev.details, walk_style: (e.target.value || undefined) as ServiceDetails['walk_style'] } }))}
                className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Select...</option>
                <option value="solo">One-on-one</option>
                <option value="group">Multi-pet</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {form.type === 'sitting' && (
        <div className="space-y-4 border-t border-stone-200 pt-4">
          <h4 className="text-sm font-semibold text-stone-700">
            {form.type === 'sitting' ? 'Sitting' : 'Boarding'} Details
          </h4>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Location</label>
            <select
              value={form.details.boarding_location || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, details: { ...prev.details, boarding_location: (e.target.value || undefined) as ServiceDetails['boarding_location'] } }))}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">Select...</option>
              <option value="owner_home">At owner's home</option>
              <option value="sitter_home">At sitter's home</option>
            </select>
          </div>
        </div>
      )}

      {form.type !== 'meet_greet' && (
        <div className="space-y-4 border-t border-stone-200 pt-4">
          <h4 className="text-sm font-semibold text-stone-700">Pickup & Dropoff</h4>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.details.pickup_available || false}
                onChange={(e) => setForm((prev) => ({ ...prev, details: { ...prev.details, pickup_available: e.target.checked } }))}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-stone-700">Offer pickup</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.details.dropoff_available || false}
                onChange={(e) => setForm((prev) => ({ ...prev, details: { ...prev.details, dropoff_available: e.target.checked } }))}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-stone-700">Offer dropoff</span>
            </label>
          </div>
          {(form.details.pickup_available || form.details.dropoff_available) && (
            <div className="grid grid-cols-2 gap-4">
              {form.details.pickup_available && (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Pickup fee ($)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.details.pickup_fee || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, details: { ...prev.details, pickup_fee: e.target.value } }))}
                    placeholder="0 (free)"
                  />
                </div>
              )}
              {form.details.dropoff_available && (
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Dropoff fee ($)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.details.dropoff_fee || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, details: { ...prev.details, dropoff_fee: e.target.value } }))}
                    placeholder="0 (free)"
                  />
                </div>
              )}
            </div>
          )}
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
