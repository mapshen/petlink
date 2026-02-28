import React, { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Service } from '../types';
import { Plus, Pencil, Trash2, DollarSign, AlertCircle, Save, X } from 'lucide-react';
import { API_BASE } from '../config';

const SERVICE_TYPES = [
  { value: 'walking', label: 'Dog Walking', icon: '🚶' },
  { value: 'sitting', label: 'House Sitting', icon: '🏠' },
  { value: 'drop-in', label: 'Drop-in Visit', icon: '👋' },
  { value: 'grooming', label: 'Grooming', icon: '✂️' },
] as const;

interface ServiceForm {
  type: string;
  price: string;
  description: string;
}

const EMPTY_FORM: ServiceForm = { type: 'walking', price: '', description: '' };

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

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.role === 'owner') { navigate('/dashboard'); return; }
    fetchServices();
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

  const handleAdd = async () => {
    if (!form.price || Number(form.price) < 1) { setError('Price must be at least $1'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/services`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          type: form.type,
          price: Number(form.price),
          description: form.description || null,
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
    if (!editingId || !form.price || Number(form.price) < 1) { setError('Price must be at least $1'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/services/${editingId}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          type: form.type,
          price: Number(form.price),
          description: form.description || null,
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
    if (!window.confirm('Delete this service? This cannot be undone.')) return;
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
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
        </div>
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
                        onClick={() => handleDelete(service.id)}
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
    </div>
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
          onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
          className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
          value={form.price}
          onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
          placeholder="e.g. 25"
          className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Description (optional)</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Describe what's included in this service..."
          rows={3}
          className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={saving || !form.price}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
