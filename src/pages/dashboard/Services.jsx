/**
 * BookUp — Services Management Page
 * Enhanced with input validation and content quality nudges
 */

import { useState } from 'react';
import { useStore, ACTIONS, generateId, formatCurrency } from '../../data/store';

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
  const [form, setForm] = useState({ name: '', description: '', price: '', duration: 60, depositAmount: '' });
  const [errors, setErrors] = useState({});

  const openCreate = () => {
    setForm({ name: '', description: '', price: '1000', duration: 60, depositAmount: '200' });
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
      depositAmount: service.depositAmount || '',
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (editingService) {
      dispatch({
        type: ACTIONS.UPDATE_SERVICE,
        payload: {
          id: editingService.id,
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          duration: Number(form.duration),
          depositAmount: Number(form.depositAmount) || 0,
        }
      });
      addToast('Service updated ✓');
    } else {
      dispatch({
        type: ACTIONS.ADD_SERVICE,
        payload: {
          id: generateId('svc'),
          providerId: state.provider?.id,
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          duration: Number(form.duration),
          depositAmount: Number(form.depositAmount) || 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        }
      });
      addToast('Service created ✓');
    }
    setShowForm(false);
  };

  const handleDelete = (id) => {
    dispatch({ type: ACTIONS.DELETE_SERVICE, payload: id });
    addToast('Service deleted');
  };

  const handleToggle = (id) => {
    dispatch({ type: ACTIONS.TOGGLE_SERVICE, payload: id });
    const service = state.services.find(s => s.id === id);
    addToast(service?.isActive ? 'Service deactivated' : 'Service activated ✓');
  };

  return (
    <div className="animate-fade-in-up">
      <div className="section-header">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">Manage the services your clients can book online.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          + Add Service
        </button>
      </div>

      {state.services.length > 0 ? (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {state.services.map(service => (
            <div className="card card-padding card-hover" key={service.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                    <h4 style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>{service.name}</h4>
                    <span className={`badge ${service.isActive ? 'badge-active' : 'badge-inactive'}`}>
                      {service.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {service.description && (
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)', maxWidth: 560 }}>
                      {service.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
                    <span><strong>{formatCurrency(service.price)}</strong></span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{service.duration} min</span>
                    {service.depositAmount > 0 && (
                      <span style={{ color: 'var(--color-primary-600)' }}>
                        {formatCurrency(service.depositAmount)} deposit
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(service)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(service.id)}>
                    {service.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error-600)' }} onClick={() => handleDelete(service.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
            <div className="empty-state-title">No services yet</div>
            <div className="empty-state-description">Create your first service to start accepting bookings.</div>
            <button className="btn btn-primary" onClick={openCreate}>+ Add Service</button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingService ? 'Edit Service' : 'Create Service'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <label className="form-label">Service name</label>
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
                  />
                  {errors.name && <span className="form-hint" style={{ color: 'var(--color-error-600)' }}>{errors.name}</span>}
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <label className="form-label">Description</label>
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
                  />
                  {errors.description ? (
                    <span className="form-hint" style={{ color: 'var(--color-error-600)' }}>{errors.description}</span>
                  ) : (
                    <span className="form-hint">Briefly explain what this session includes so clients book with confidence.</span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Price (₹)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      placeholder="1000"
                      value={form.price}
                      onChange={e => setForm({ ...form, price: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duration (minutes)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="15"
                      step="15"
                      value={form.duration}
                      onChange={e => setForm({ ...form, duration: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">UPI deposit to confirm (₹)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.depositAmount}
                    onChange={e => setForm({ ...form, depositAmount: e.target.value })}
                  />
                  <span className="form-hint">Collected via UPI before confirming slot. Enter 0 for free booking.</span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingService ? 'Save Changes' : 'Create Service'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
