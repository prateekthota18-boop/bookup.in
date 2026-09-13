/**
 * BookUp — Services Management Page
 * Enhanced with input validation and content quality nudges
 */

import { useState } from 'react';
import { useStore, generateId, formatCurrency } from '../../data/store';
import { ACTIONS } from '../../data/actions';
import { isSupabaseConfigured } from '../../services/supabase/supabaseClient';
import { dbService } from '../../services/supabase/dbService';
import PillButton from '../../components/ui/PillButton';

// Helper to detect obvious keyboard-mash gibberish
function isGibberish(str) {
  const clean = str.trim().toLowerCase();
  if (clean.length < 3) return true;
  // All consonants or repetition of meaningless short tokens
  if (/^[bcdfghjklmnpqrstvwxyz]+$/i.test(clean) && clean.length >= 3) return true;
  if (/^(fdg|ghd|gfh|asdf|qwerty|zxcv|test1|aaa|bbb)+$/i.test(clean)) return true;
  return false;
}

export default function Services() {
  const { state, dispatch, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', duration: 60 });
  const [errors, setErrors] = useState({});

  const openCreate = () => {
    setForm({ name: '', description: '', price: '1000', duration: 60 });
    setEditingService(null);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (service) => {
    setForm({
      name: service.name,
      description: service.description || '',
      price: service.price,
      duration: service.duration,
    });
    setEditingService(service);
    setErrors({});
    setShowForm(true);
  };

  const validateForm = () => {
    const errs = {};
    const trimmedName = form.name.trim();
    const trimmedDesc = form.description.trim();

    if (!trimmedName || trimmedName.length < 3) {
      errs.name = 'Service name must be at least 3 characters.';
    } else if (isGibberish(trimmedName)) {
      errs.name = 'Please enter a clear service name (e.g. "Personal Consultation", "Posture Analysis").';
    }

    if (!trimmedDesc || trimmedDesc.length < 15) {
      errs.description = 'Description must be at least 15 characters to explain what clients get.';
    } else if (isGibberish(trimmedDesc)) {
      errs.description = 'Please provide a clear description instead of placeholder text.';
    }

    if (form.price === '' || Number(form.price) < 0) {
      errs.price = 'Please enter a valid price.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (editingService) {
      if (!state.auth?.isDemoMode && isSupabaseConfigured() && !editingService.id.startsWith('svc-')) {
        dbService.updateService(editingService.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          duration: Number(form.duration),
          depositAmount: 0,
        }).catch(err => console.error('Failed to update service in Supabase:', err));
      }

      dispatch({
        type: ACTIONS.UPDATE_SERVICE,
        payload: {
          id: editingService.id,
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          duration: Number(form.duration),
          depositAmount: 0,
        }
      });
      addToast('Service updated ✓');
    } else {
      let newServiceId = generateId('svc');

      if (!state.auth?.isDemoMode && isSupabaseConfigured() && state.provider?.id) {
        try {
          const created = await dbService.createService({
            providerId: state.provider.id,
            name: form.name.trim(),
            description: form.description.trim(),
            price: Number(form.price),
            duration: Number(form.duration),
            depositAmount: 0,
            isActive: true,
          });
          if (created?.id) {
            newServiceId = created.id;
          }
        } catch (err) {
          console.error('Failed to create service in Supabase:', err);
        }
      }

      dispatch({
        type: ACTIONS.ADD_SERVICE,
        payload: {
          id: newServiceId,
          providerId: state.provider?.id,
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          duration: Number(form.duration),
          depositAmount: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        }
      });
      addToast('Service created ✓');
    }
    setShowForm(false);
  };

  const handleDelete = (id) => {
    if (!state.auth?.isDemoMode && isSupabaseConfigured() && id && !id.startsWith('svc-')) {
      dbService.deleteService(id).catch(err => console.error('Failed to delete service in Supabase:', err));
    }

    dispatch({ type: ACTIONS.DELETE_SERVICE, payload: id });
    addToast('Service deleted');
  };

  const handleToggle = (id) => {
    const service = state.services.find(s => s.id === id);
    const nextState = !service?.isActive;

    if (!state.auth?.isDemoMode && isSupabaseConfigured() && id && !id.startsWith('svc-')) {
      dbService.toggleService(id, nextState).catch(err => console.error('Failed to toggle service in Supabase:', err));
    }

    dispatch({ type: ACTIONS.TOGGLE_SERVICE, payload: id });
    addToast(nextState ? 'Service activated ✓' : 'Service deactivated');
  };

  return (
    <div className="animate-fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
            Service Offerings
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: '3px 0 0' }}>
            Manage the active services clients can book on your link.
          </p>
        </div>
        <PillButton variant="primary" size="md" onClick={openCreate}>
          + Add Service
        </PillButton>
      </div>

      {state.services.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
          {state.services.map(service => (
            <div
              key={service.id}
              className="card"
              style={{
                borderRadius: 'var(--radius-card)',
                background: 'var(--theme-bg-card)',
                boxShadow: 'var(--shadow-card)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all var(--transition-fast)',
                border: '1px solid var(--theme-border)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                  <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                    {service.name}
                  </h4>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: service.isActive ? 'var(--color-lime-soft)' : 'var(--theme-input-bg)',
                      color: service.isActive ? '#2B3505' : 'var(--theme-text-muted)',
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {service.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {service.description && (
                  <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', lineHeight: 1.5, margin: '0 0 16px', minHeight: '38px' }}>
                    {service.description}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 800, color: 'var(--color-text)' }}>
                    {formatCurrency(service.price)}
                  </span>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--theme-bg-card-subtle)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--theme-text-muted)',
                  }}>
                    ⏱ {service.duration} min
                  </span>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
                paddingTop: '16px',
                borderTop: '1px solid var(--theme-border)',
              }}>
                <button
                  type="button"
                  onClick={() => openEdit(service)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--theme-border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'var(--color-text)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(service.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--theme-border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'var(--color-text)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {service.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(service.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'var(--color-error-600)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>
            No services configured
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--theme-text-muted)', margin: '0 0 20px' }}>
            Add your first service so clients can book appointments online.
          </p>
          <PillButton variant="primary" onClick={openCreate}>
            + Add Service
          </PillButton>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="modal modal-lg"
            onClick={e => e.stopPropagation()}
            style={{
              borderRadius: '26px',
              overflow: 'hidden',
              background: 'var(--theme-bg-card)',
              border: '1px solid var(--theme-border)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid var(--theme-border)', padding: '20px 24px' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 700, margin: 0 }}>
                {editingService ? 'Edit Service' : 'Create Service'}
              </h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '24px' }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>Service name</label>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: form.name.length >= 3 ? 'var(--color-success-600)' : 'var(--color-text-tertiary)' }}>
                      min 3 chars
                    </span>
                  </div>
                  <input
                    className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                    placeholder="e.g. 1-on-1 Fitness Assessment"
                    value={form.name}
                    onChange={e => {
                      setForm({ ...form, name: e.target.value });
                      if (errors.name) setErrors({ ...errors, name: null });
                    }}
                    required
                    autoFocus
                    style={{ borderRadius: '12px' }}
                  />
                  {errors.name && <span className="form-hint" style={{ color: 'var(--color-error-600)' }}>{errors.name}</span>}
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>Description</label>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: form.description.length >= 15 ? 'var(--color-success-600)' : 'var(--color-text-tertiary)' }}>
                      {form.description.length}/15 min chars
                    </span>
                  </div>
                  <textarea
                    className={`form-input form-textarea ${errors.description ? 'form-input-error' : ''}`}
                    placeholder="e.g. Comprehensive 1-on-1 fitness checkup including posture analysis, body metrics, and customized workout recommendations."
                    value={form.description}
                    onChange={e => {
                      setForm({ ...form, description: e.target.value });
                      if (errors.description) setErrors({ ...errors, description: null });
                    }}
                    rows={3}
                    style={{ borderRadius: '12px' }}
                  />
                  {errors.description ? (
                    <span className="form-hint" style={{ color: 'var(--color-error-600)' }}>{errors.description}</span>
                  ) : (
                    <span className="form-hint">Briefly explain what this session includes so clients book with confidence.</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>Price (₹)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      placeholder="1000"
                      value={form.price}
                      onChange={e => setForm({ ...form, price: e.target.value })}
                      required
                      style={{ borderRadius: '12px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>Duration (minutes)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="15"
                      step="15"
                      value={form.duration}
                      onChange={e => setForm({ ...form, duration: e.target.value })}
                      required
                      style={{ borderRadius: '12px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--theme-border)', padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--theme-border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: 'var(--color-text)',
                  }}
                >
                  Cancel
                </button>
                <PillButton type="submit" variant="primary" size="sm">
                  {editingService ? 'Save Changes' : 'Create Service'}
                </PillButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
