/**
 * BookUp — Supabase Database Service
 * Authoritative data layer for providers, services, availability, bookings, and policies.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { hashManagementToken } from '../../utils/token.js';

const DAYS_LIST = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const dbService = {
  // ===========================================================================
  // PROVIDER & AUTH
  // ===========================================================================

  async getProviderBySlug(slug) {
    if (!isSupabaseConfigured() || !slug) return null;

    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .eq('slug', slug.trim())
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      businessName: data.business_name || '',
      slug: data.slug,
      email: data.email || '',
      phone: data.phone || '',
      timezone: data.timezone || 'Asia/Kolkata',
      bio: data.bio || '',
      bufferTime: data.buffer_time ?? 15,
      minNotice: data.min_notice ?? 2,
      maxAdvanceBooking: data.max_advance_booking ?? 30,
      avatar: data.avatar_url || data.avatar || null,
      avatarUrl: data.avatar_url || data.avatar || null,
      upiId: data.upi_id || null,
      qrCodeUrl: data.qr_code_url || null,
      createdAt: data.created_at,
    };
  },

  async getProviderByUserId(userId) {
    if (!isSupabaseConfigured() || !userId) return null;

    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      businessName: data.business_name || '',
      slug: data.slug,
      email: data.email || '',
      phone: data.phone || '',
      timezone: data.timezone || 'Asia/Kolkata',
      bio: data.bio || '',
      bufferTime: data.buffer_time ?? 15,
      minNotice: data.min_notice ?? 2,
      maxAdvanceBooking: data.max_advance_booking ?? 30,
      avatar: data.avatar_url || data.avatar || null,
      avatarUrl: data.avatar_url || data.avatar || null,
      upiId: data.upi_id || null,
      qrCodeUrl: data.qr_code_url || null,
      createdAt: data.created_at,
    };
  },

  async createProviderProfile({ userId, name, businessName, slug, email, phone, bio }) {
    if (!isSupabaseConfigured()) return null;

    // 1. If provider already exists for this userId, update and return it to prevent duplicates
    if (userId) {
      const existing = await this.getProviderByUserId(userId);
      if (existing) {
        await this.updateProviderProfile(existing.id, {
          name: name || existing.name,
          businessName: businessName !== undefined ? businessName : existing.businessName,
          slug: slug || existing.slug,
          email: email || existing.email,
          phone: phone !== undefined ? phone : existing.phone,
          bio: bio !== undefined ? bio : existing.bio,
        });
        return await this.getProviderByUserId(userId);
      }

      // 2. Check if an unlinked provider exists with the same email
      if (email) {
        const { data: emailMatch } = await supabase
          .from('providers')
          .select('*')
          .eq('email', email.trim().toLowerCase())
          .is('user_id', null)
          .maybeSingle();

        if (emailMatch) {
          try {
            await this.updateProviderProfile(emailMatch.id, {
              userId,
              name: name || emailMatch.name,
              businessName: businessName !== undefined ? businessName : emailMatch.business_name,
              phone: phone !== undefined ? phone : emailMatch.phone,
              bio: bio !== undefined ? bio : emailMatch.bio,
            });
            const linked = await this.getProviderByUserId(userId);
            if (linked) return linked;
          } catch {
            // If RLS blocked updating unlinked provider from client, fall through to insert
          }
        }
      }
    }

    // 3. Ensure slug is unique before insert
    let baseSlug = slug || 'provider';
    let finalSlug = baseSlug;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      const { data: slugTaken } = await supabase
        .from('providers')
        .select('id')
        .eq('slug', finalSlug)
        .maybeSingle();

      if (!slugTaken) {
        isUnique = true;
      } else {
        attempts++;
        finalSlug = `${baseSlug}-${userId ? userId.slice(0, 4) : 'p'}-${Math.floor(Math.random() * 9000 + 1000)}`;
      }
    }

    const { data, error } = await supabase
      .from('providers')
      .insert({
        user_id: userId,
        name: name || 'Provider',
        business_name: businessName || '',
        slug: finalSlug,
        email: email || '',
        phone: phone || '',
        bio: bio || '',
        timezone: 'Asia/Kolkata',
        buffer_time: 15,
        min_notice: 2,
        max_advance_booking: 30,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating provider profile:', error);
      throw error;
    }

    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      businessName: data.business_name || '',
      slug: data.slug,
      email: data.email || '',
      phone: data.phone || '',
      timezone: data.timezone || 'Asia/Kolkata',
      bio: data.bio || '',
      bufferTime: data.buffer_time ?? 15,
      minNotice: data.min_notice ?? 2,
      maxAdvanceBooking: data.max_advance_booking ?? 30,
      createdAt: data.created_at,
    };
  },

  async updateProviderProfile(providerId, fields) {
    if (!isSupabaseConfigured() || !providerId) return false;

    // Guard: ensure providerId is a valid UUID before querying Supabase
    const isUuid = typeof providerId === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(providerId);
    if (!isUuid) {
      console.warn(`[dbService] updateProviderProfile skipped DB update: providerId '${providerId}' is not a valid UUID.`);
      return true;
    }

    const updatePayload = {};
    if (fields.userId !== undefined) updatePayload.user_id = fields.userId;
    if (fields.name !== undefined) updatePayload.name = fields.name;
    if (fields.businessName !== undefined) updatePayload.business_name = fields.businessName;
    if (fields.slug !== undefined) updatePayload.slug = fields.slug;
    if (fields.email !== undefined) updatePayload.email = fields.email;
    if (fields.phone !== undefined) updatePayload.phone = fields.phone;
    if (fields.bio !== undefined) updatePayload.bio = fields.bio;
    if (fields.bufferTime !== undefined) updatePayload.buffer_time = fields.bufferTime;
    if (fields.minNotice !== undefined) updatePayload.min_notice = fields.minNotice;
    if (fields.maxAdvanceBooking !== undefined) updatePayload.max_advance_booking = fields.maxAdvanceBooking;
    if (fields.avatarUrl !== undefined) updatePayload.avatar_url = fields.avatarUrl;
    if (fields.avatar !== undefined && fields.avatarUrl === undefined) updatePayload.avatar_url = fields.avatar;
    if (fields.upiId !== undefined) updatePayload.upi_id = fields.upiId;
    if (fields.qrCodeUrl !== undefined) updatePayload.qr_code_url = fields.qrCodeUrl;

    const { error } = await supabase
      .from('providers')
      .update(updatePayload)
      .eq('id', providerId);

    if (error) {
      console.error('Error updating provider profile:', error);
      throw error;
    }

    return true;
  },

  async uploadAvatar(providerId, file) {
    if (!file) return null;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image must be under 5MB.');
    }

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      throw new Error('Only JPG, PNG, or WebP images are supported.');
    }

    // Attempt Supabase storage upload if configured
    if (isSupabaseConfigured()) {
      try {
        const fileExt = file.name ? file.name.split('.').pop() : 'jpg';
        const fileName = `${providerId || 'coach'}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, file, { upsert: true, contentType: file.type });

        if (!uploadError) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
          if (data?.publicUrl) {
            return data.publicUrl;
          }
        }
      } catch (err) {
        console.warn('Supabase storage upload failed, using local DataURL fallback:', err);
      }
    }

    // Fallback to Data URL (for demo mode / offline support)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // ===========================================================================
  // SERVICES
  // ===========================================================================

  async getServices(providerId, onlyActive = false) {
    if (!isSupabaseConfigured() || !providerId) return [];

    let query = supabase
      .from('services')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: true });

    if (onlyActive) {
      query = query.eq('active', true);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map(s => ({
      id: s.id,
      providerId: s.provider_id,
      name: s.name,
      description: s.description || '',
      duration: Number(s.duration) || 60,
      price: Number(s.price) || 0,
      depositAmount: Number(s.deposit_amount) || 0,
      isActive: Boolean(s.active),
      createdAt: s.created_at,
    }));
  },

  async createService(service) {
    if (!isSupabaseConfigured()) return null;

    const { data, error } = await supabase
      .from('services')
      .insert({
        provider_id: service.providerId,
        name: service.name,
        description: service.description || '',
        duration: Number(service.duration) || 60,
        price: Number(service.price) || 0,
        deposit_amount: Number(service.depositAmount) || 0,
        active: service.isActive !== undefined ? service.isActive : true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating service:', error);
      throw error;
    }

    return {
      id: data.id,
      providerId: data.provider_id,
      name: data.name,
      description: data.description,
      duration: Number(data.duration),
      price: Number(data.price),
      depositAmount: Number(data.deposit_amount),
      isActive: Boolean(data.active),
      createdAt: data.created_at,
    };
  },

  async updateService(serviceId, service) {
    if (!isSupabaseConfigured() || !serviceId) return false;

    const updatePayload = {};
    if (service.name !== undefined) updatePayload.name = service.name;
    if (service.description !== undefined) updatePayload.description = service.description;
    if (service.duration !== undefined) updatePayload.duration = Number(service.duration);
    if (service.price !== undefined) updatePayload.price = Number(service.price);
    if (service.depositAmount !== undefined) updatePayload.deposit_amount = Number(service.depositAmount);
    if (service.isActive !== undefined) updatePayload.active = Boolean(service.isActive);

    const { error } = await supabase
      .from('services')
      .update(updatePayload)
      .eq('id', serviceId);

    if (error) {
      console.error('Error updating service:', error);
      throw error;
    }

    return true;
  },

  async toggleService(serviceId, active) {
    return this.updateService(serviceId, { isActive: active });
  },

  async deleteService(serviceId) {
    if (!isSupabaseConfigured() || !serviceId) return false;

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', serviceId);

    if (error) {
      console.error('Error deleting service:', error);
      throw error;
    }

    return true;
  },

  // ===========================================================================
  // AVAILABILITY
  // ===========================================================================

  async getAvailability(providerId) {
    if (!isSupabaseConfigured() || !providerId) return null;

    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('provider_id', providerId);

    if (error) return null;

    const schedule = {};
    DAYS_LIST.forEach(d => {
      schedule[d] = { available: d !== 'sunday', start: '09:00', end: '18:00' };
    });

    if (data && data.length > 0) {
      data.forEach(row => {
        const day = row.day_of_week?.toLowerCase();
        if (day && schedule[day]) {
          schedule[day] = {
            available: Boolean(row.active),
            start: row.start_time ? String(row.start_time).substring(0, 5) : '09:00',
            end: row.end_time ? String(row.end_time).substring(0, 5) : '18:00',
          };
        }
      });
    }

    return schedule;
  },

  async saveAvailability(providerId, schedule, rules = {}) {
    if (!isSupabaseConfigured() || !providerId) return false;

    // 1. Update rules on providers table
    if (rules.bufferTime !== undefined || rules.minNotice !== undefined || rules.maxAdvanceBooking !== undefined) {
      await this.updateProviderProfile(providerId, rules);
    }

    // 2. Upsert each day of the week
    const rows = Object.entries(schedule).map(([day, val]) => ({
      provider_id: providerId,
      day_of_week: day.toLowerCase(),
      start_time: val.start || '09:00',
      end_time: val.end || '18:00',
      active: Boolean(val.available),
    }));

    const { error } = await supabase
      .from('availability')
      .upsert(rows, { onConflict: 'provider_id,day_of_week' });

    if (error) {
      console.error('Error saving availability:', error);
      throw error;
    }

    return true;
  },

  // ===========================================================================
  // CANCELLATION POLICIES
  // ===========================================================================

  async getPolicy(providerId) {
    if (!isSupabaseConfigured() || !providerId) return null;

    const { data, error } = await supabase
      .from('cancellation_policies')
      .select('*')
      .eq('provider_id', providerId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      providerId: data.provider_id,
      cancellationWindow: data.cancellation_window ?? 12,
      depositAmount: Number(data.fee) ?? 200,
      depositType: 'fixed',
      lateCancellationFee: Number(data.fee) ?? 200,
      noShowFee: Number(data.fee) ?? 200,
      policyText: data.policy_text || '',
    };
  },

  async savePolicy(providerId, policy) {
    if (!isSupabaseConfigured() || !providerId) return false;

    const row = {
      provider_id: providerId,
      cancellation_window: Number(policy.cancellationWindow) || 12,
      fee: Number(policy.depositAmount ?? policy.lateCancellationFee ?? 200),
      enabled: policy.enabled !== undefined ? policy.enabled : true,
      policy_text: policy.policyText || '',
    };

    const { error } = await supabase
      .from('cancellation_policies')
      .upsert(row, { onConflict: 'provider_id' });

    if (error) {
      console.error('Error saving cancellation policy:', error);
      throw error;
    }

    return true;
  },

  // ===========================================================================
  // BOOKINGS & CONFLICT-FREE CREATION
  // ===========================================================================

  async getBookings(providerId) {
    if (!isSupabaseConfigured() || !providerId) return [];

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        services (name)
      `)
      .eq('provider_id', providerId)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error || !data) return [];

    return data.map(b => ({
      id: b.id,
      providerId: b.provider_id,
      serviceId: b.service_id,
      serviceName: b.services?.name || b.service_name || 'Service',
      customerId: b.customer_id,
      customerName: b.customer_name,
      customerPhone: b.customer_phone,
      customerWhatsApp: b.customer_whatsapp || b.customer_phone,
      customerEmail: b.customer_email || '',
      date: b.booking_date,
      startTime: b.start_time ? String(b.start_time).substring(0, 5) : '',
      endTime: b.end_time ? String(b.end_time).substring(0, 5) : '',
      actualEndTime: b.actual_end_time ? String(b.actual_end_time).substring(0, 5) : undefined,
      duration: Number(b.duration) || 60,
      price: Number(b.price) || 0,
      depositAmount: Number(b.deposit_amount) || 0,
      depositStatus: b.deposit_status || 'na',
      status: b.status,
      notes: b.notes || '',
      createdAt: b.created_at,
      paymentStatus: b.payment_status || null,
      paymentScreenshotUrl: b.payment_screenshot_url || null,
      paymentMarkedPaidAt: b.payment_marked_paid_at || null,
      paymentConfirmedAt: b.payment_confirmed_at || null,
      paymentRejectedAt: b.payment_rejected_at || null,
      paymentRejectedReason: b.payment_rejected_reason || null,
    }));
  },

  /**
   * Get single booking by ID (used by legacy /booking/:id)
   */
  async getBookingById(bookingId) {
    return this.getBookingByManagementToken(bookingId);
  },

  /**
   * Get single booking by persistent management token (or booking ID fallback)
   * Loads booking details along with provider profile, services, availability, and policies
   */
  async getBookingByManagementToken(token) {
    if (!isSupabaseConfigured() || !token) return null;
    const trimmed = String(token).trim();
    if (!trimmed) return null;

    let data = null;

    // 1. Hash the token and search by management_token_hash or notes tag
    try {
      const tokenHash = await hashManagementToken(trimmed);
      if (tokenHash) {
        // Authoritative: Check management_token_hash column
        try {
          const { data: colMatch, error: colErr } = await supabase
            .from('bookings')
            .select(`
              *,
              services (*),
              providers (*)
            `)
            .eq('management_token_hash', tokenHash)
            .maybeSingle();
          if (!colErr && colMatch) data = colMatch;
        } catch {
          // Column may not exist yet
        }

        // Backward compatibility fallback: notes containing [mgmt_hash:<hash>]
        if (!data) {
          const { data: noteMatch } = await supabase
            .from('bookings')
            .select(`
              *,
              services (*),
              providers (*)
            `)
            .ilike('notes', `%[mgmt_hash:${tokenHash}]%`)
            .maybeSingle();

          if (noteMatch) {
            data = noteMatch;
          }
        }
      }
    } catch (e) {
      console.warn('Token hash lookup warning:', e);
    }

    if (!data) return null;

    const providerId = data.provider_id;
    let policy = null;
    let services = [];
    let availability = null;

    if (providerId) {
      try {
        const [polRes, svcRes, availRes] = await Promise.allSettled([
          this.getPolicy(providerId),
          this.getServices(providerId, true),
          this.getAvailability(providerId),
        ]);
        if (polRes.status === 'fulfilled') policy = polRes.value;
        if (svcRes.status === 'fulfilled') services = svcRes.value || [];
        if (availRes.status === 'fulfilled') availability = availRes.value;
      } catch (err) {
        console.warn('Failed to hydrate provider metadata for booking:', err);
      }
    }

    const cleanNotes = (data.notes || '').replace(/\[mgmt_hash:[^\]]+\]/g, '').trim();

    return {
      booking: {
        id: data.id,
        providerId: data.provider_id,
        serviceId: data.service_id,
        serviceName: data.services?.name || data.service_name || 'Service',
        customerId: data.customer_id,
        customerName: data.customer_name,
        customerPhone: data.customer_phone,
        customerWhatsApp: data.customer_whatsapp || data.customer_phone,
        customerEmail: data.customer_email || '',
        date: data.booking_date,
        startTime: data.start_time ? String(data.start_time).substring(0, 5) : '',
        endTime: data.end_time ? String(data.end_time).substring(0, 5) : '',
        actualEndTime: data.actual_end_time ? String(data.actual_end_time).substring(0, 5) : undefined,
        duration: Number(data.duration) || 60,
        price: Number(data.price) || 0,
        depositAmount: Number(data.deposit_amount) || 0,
        depositStatus: data.deposit_status || 'na',
        status: data.status,
        notes: cleanNotes,
        createdAt: data.created_at,
        managementToken: trimmed,
        paymentStatus: data.payment_status || ((Number(data.price) || 0) > 0 ? 'awaiting_payment' : 'not_required'),
        paymentScreenshotUrl: data.payment_screenshot_url || null,
        paymentMarkedPaidAt: data.payment_marked_paid_at || null,
        paymentConfirmedAt: data.payment_confirmed_at || null,
        paymentRejectedAt: data.payment_rejected_at || null,
        paymentRejectedReason: data.payment_rejected_reason || null,
      },
      provider: data.providers ? {
        id: data.providers.id,
        name: data.providers.name,
        businessName: data.providers.business_name,
        slug: data.providers.slug,
        email: data.providers.email,
        phone: data.providers.phone,
        bufferTime: data.providers.buffer_time ?? 15,
        minNotice: data.providers.min_notice ?? 2,
        maxAdvanceBooking: data.providers.max_advance_booking ?? 30,
        upiId: data.providers.upi_id || null,
        qrCodeUrl: data.providers.qr_code_url || null,
      } : null,
      service: data.services ? {
        id: data.services.id,
        name: data.services.name,
        duration: Number(data.services.duration),
        price: Number(data.services.price),
        depositAmount: Number(data.services.deposit_amount),
      } : null,
      policies: policy,
      services,
      availability,
    };
  },

  /**
   * Authoritative Atomic Booking Creation with DB-Side Overlap Lock
   */
  async createBookingAtomic({
    providerId,
    serviceId,
    customerName,
    customerEmail,
    customerPhone,
    customerWhatsApp,
    bookingDate,
    startTime,
    notes = '',
    managementTokenHash = '',
  }) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured.');
    }

    const finalNotes = managementTokenHash
      ? (notes ? `${notes}\n[mgmt_hash:${managementTokenHash}]` : `[mgmt_hash:${managementTokenHash}]`)
      : notes;

    // Attempt RPC first (enforcing lock in PostgreSQL)
    let rpcResult = null;
    let rpcError = null;

    const rpcPayload = {
      p_provider_id: providerId,
      p_service_id: serviceId,
      p_customer_name: customerName,
      p_customer_email: customerEmail || '',
      p_customer_phone: customerPhone,
      p_customer_whatsapp: customerWhatsApp || customerPhone,
      p_booking_date: bookingDate,
      p_start_time: startTime,
      p_notes: finalNotes,
      p_management_token_hash: managementTokenHash || null,
    };

    const resWithHash = await supabase.rpc('create_booking_atomic', rpcPayload);
    if (resWithHash.error && (resWithHash.error.message?.includes('p_management_token_hash') || resWithHash.error.code === 'PGRST202')) {
      // Fallback for previous RPC signature
      delete rpcPayload.p_management_token_hash;
      const resLegacy = await supabase.rpc('create_booking_atomic', rpcPayload);
      rpcResult = resLegacy.data;
      rpcError = resLegacy.error;
    } else {
      rpcResult = resWithHash.data;
      rpcError = resWithHash.error;
    }

    if (!rpcError && rpcResult) {
      if (rpcResult.success === false) {
        throw new Error(rpcResult.error || 'Slot conflict: This time is already booked.');
      }
      const rpcBookingId = rpcResult.booking_id || rpcResult.bookingId;
      if (rpcBookingId && managementTokenHash) {
        try {
          await supabase
            .from('bookings')
            .update({ management_token_hash: managementTokenHash })
            .eq('id', rpcBookingId);
        } catch {
          // Ignore if column doesn't exist yet or restricted
        }
      }
      return rpcResult;
    }

    // Fallback if RPC function not yet run in SQL console: perform safe query-level check
    console.warn('RPC create_booking_atomic not available or returned error, running fallback check:', rpcError?.message);

    // Fetch authoritative service
    const { data: svc, error: svcErr } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .eq('provider_id', providerId)
      .single();

    if (svcErr || !svc) {
      throw new Error('Invalid or inactive service');
    }

    // Fetch provider buffer
    const { data: prov } = await supabase
      .from('providers')
      .select('buffer_time')
      .eq('id', providerId)
      .single();

    const buffer = prov?.buffer_time ?? 15;
    const [h, m] = startTime.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + svc.duration;
    const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    // Conflict check
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('start_time, end_time, actual_end_time, status')
      .eq('provider_id', providerId)
      .eq('booking_date', bookingDate)
      .in('status', ['confirmed', 'completed']);

    const candStart = startMin;
    const candEnd = endMin + buffer;

    const conflict = existingBookings?.some(eb => {
      const ebStart = eb.start_time ? Number(eb.start_time.split(':')[0]) * 60 + Number(eb.start_time.split(':')[1]) : 0;
      const ebEndRaw = eb.actual_end_time || eb.end_time;
      const ebEnd = ebEndRaw ? Number(ebEndRaw.split(':')[0]) * 60 + Number(ebEndRaw.split(':')[1]) : ebStart + 60;
      const ebEndWithBuf = ebEnd + buffer;

      // candidateStart < existingEnd AND candidateEnd > existingStart
      return candStart < ebEndWithBuf && candEnd > ebStart;
    });

    if (conflict) {
      throw new Error('This slot is no longer available. Please select another time.');
    }

    // Insert booking (including management_token_hash directly)
    const insertPayload = {
      provider_id: providerId,
      service_id: svc.id,
      customer_name: customerName,
      customer_email: customerEmail || '',
      customer_phone: customerPhone,
      customer_whatsapp: customerWhatsApp || customerPhone,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      duration: svc.duration,
      price: svc.price,
      deposit_amount: svc.deposit_amount || 0,
      deposit_status: 'na',
      status: 'confirmed',
      notes: finalNotes,
    };
    if (managementTokenHash) {
      insertPayload.management_token_hash = managementTokenHash;
    }

    const { data: newBooking, error: insertErr } = await supabase
      .from('bookings')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      throw new Error(insertErr.message);
    }

    return {
      success: true,
      bookingId: newBooking.id,
      endTime,
      price: svc.price,
      depositAmount: svc.deposit_amount || 0,
    };
  },

  async updateBookingStatus(bookingId, status, extraFields = {}) {
    if (!isSupabaseConfigured() || !bookingId) return false;

    const updatePayload = {
      status,
      updated_at: new Date().toISOString(),
      ...extraFields,
    };

    const { error } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId);

    if (error) {
      console.error('Error updating booking status:', error);
      throw error;
    }

    return true;
  },

  async rescheduleBooking(bookingId, newDate, newStartTime, newEndTime) {
    if (!isSupabaseConfigured() || !bookingId) return false;

    const { error } = await supabase
      .from('bookings')
      .update({
        booking_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (error) {
      console.error('Error rescheduling booking:', error);
      throw error;
    }

    return true;
  },

  async deleteBooking(bookingId) {
    if (!isSupabaseConfigured() || !bookingId) return false;

    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId);

    if (error) {
      console.error('Error deleting booking:', error);
      throw error;
    }

    return true;
  },

  // ===========================================================================
  // PUBLIC BOOKING PAGE BUNDLE LOADER
  // ===========================================================================

  /**
   * Get provider busy time intervals without exposing customer PII
   */
  async getBusySlots(providerId, date) {
    if (!providerId || !date) return [];

    // 1. Fetch from backend endpoint (service-role backed, highly reliable)
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/public/busy-slots?providerId=${encodeURIComponent(providerId)}&date=${encodeURIComponent(date)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.busySlots)) {
          return json.busySlots;
        }
      }
    } catch (_err) {
      // Non-blocking fallback to RPC
    }

    // 2. Fallback to Supabase RPC if backend is not reachable
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.rpc('get_provider_busy_slots', {
          p_provider_id: providerId,
          p_booking_date: date,
        });
        if (!error && Array.isArray(data)) {
          return data
            .filter(b => b.payment_status !== 'rejected')
            .map(b => ({
              start_time: b.start_time,
              end_time: b.end_time,
              actual_end_time: b.actual_end_time || null,
            }));
        }
      } catch {
        // Fallback
      }
    }
    return [];
  },

  async getPublicBookingData(slug) {
    if (!isSupabaseConfigured() || !slug) return null;

    const provider = await this.getProviderBySlug(slug);
    if (!provider) return null;

    // Parallel fetch services, availability, and policies (NO customer PII or bookings)
    const [services, availabilitySchedule, policy] = await Promise.all([
      this.getServices(provider.id, true),
      this.getAvailability(provider.id),
      this.getPolicy(provider.id),
    ]);

    const availability = {
      schedule: availabilitySchedule,
      bufferTime: provider.bufferTime ?? 15,
      minNotice: provider.minNotice ?? 2,
      maxAdvanceBooking: provider.maxAdvanceBooking ?? 30,
    };

    return {
      provider,
      services,
      availability,
      bookings: [],
      policies: policy,
    };
  },

  // ===========================================================================
  // DASHBOARD HYDRATION
  // ===========================================================================

  async getDashboardData(userId) {
    if (!isSupabaseConfigured() || !userId) return null;

    const provider = await this.getProviderByUserId(userId);
    if (!provider) return null;

    const [services, availabilitySchedule, bookings, policy] = await Promise.all([
      this.getServices(provider.id, false),
      this.getAvailability(provider.id),
      this.getBookings(provider.id),
      this.getPolicy(provider.id),
    ]);

    const availability = {
      schedule: availabilitySchedule,
      bufferTime: provider.bufferTime ?? 15,
      minNotice: provider.minNotice ?? 2,
      maxAdvanceBooking: provider.maxAdvanceBooking ?? 30,
    };

    return {
      provider,
      services,
      availability,
      bookings,
      policies: policy,
    };
  },

  // ===========================================================================
  // PAYMENT VERIFICATION (Coach / Provider)
  // ===========================================================================

  async confirmPayment(bookingId) {
    if (!bookingId) throw new Error('Booking ID is required');

    if (!isSupabaseConfigured()) {
      return { success: true, booking: { id: bookingId, paymentStatus: 'confirmed' } };
    }

    const apiBase = getApiBase();
    let authHeaders = {};
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        authHeaders = { Authorization: `Bearer ${session.access_token}` };
      }
    } catch (err) {
      console.warn('Could not retrieve Supabase session token:', err);
    }

    const res = await fetch(`${apiBase}/bookings/${encodeURIComponent(bookingId)}/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders,
      },
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Failed to confirm payment');
    }
    return result;
  },

  async rejectPayment(bookingId, reason = '') {
    if (!bookingId) throw new Error('Booking ID is required');

    if (!isSupabaseConfigured()) {
      return { success: true, booking: { id: bookingId, paymentStatus: 'rejected', status: 'cancelled' } };
    }

    const apiBase = getApiBase();
    let authHeaders = {};
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        authHeaders = { Authorization: `Bearer ${session.access_token}` };
      }
    } catch (err) {
      console.warn('Could not retrieve Supabase session token:', err);
    }

    const res = await fetch(`${apiBase}/bookings/${encodeURIComponent(bookingId)}/reject-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ reason: typeof reason === 'string' ? reason.trim() : '' }),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Failed to reject payment');
    }
    return result;
  },
};

function getApiBase() {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '';
  if (envUrl.trim()) {
    return `${envUrl.trim().replace(/\/$/, '')}/api`;
  }
  if (typeof window !== 'undefined' && window.location?.hostname?.includes('vercel.app')) {
    return 'https://bookup-in.onrender.com/api';
  }
  return '/api';
}

