alter table public.providers alter column user_id drop not null;

do $$
declare
  v_provider_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_service_id1 uuid := 'b0000000-0000-0000-0000-000000000001'::uuid;
  v_service_id2 uuid := 'b0000000-0000-0000-0000-000000000002'::uuid;
begin
  delete from public.bookings where provider_id = v_provider_id;
  delete from public.cancellation_policies where provider_id = v_provider_id;
  delete from public.availability where provider_id = v_provider_id;
  delete from public.services where provider_id = v_provider_id;
  delete from public.providers where id = v_provider_id;

  insert into public.providers (
    id,
    user_id,
    name,
    business_name,
    slug,
    email,
    phone,
    timezone,
    bio,
    buffer_time,
    min_notice,
    max_advance_booking
  ) values (
    v_provider_id,
    null,
    'Dr. Arjun Patel',
    'Patel Wellness Clinic',
    'dr-arjun-patel',
    'arjun.patel@example.com',
    '+91 98765 43210',
    'Asia/Kolkata',
    'Experienced Physiotherapist & Wellness Consultant based in Mumbai.',
    15,
    2,
    30
  );

  insert into public.services (
    id,
    provider_id,
    name,
    description,
    duration,
    price,
    deposit_amount,
    active
  ) values 
  (
    v_service_id1,
    v_provider_id,
    'Initial Consultation & Assessment',
    'Comprehensive 45-minute physical assessment and personalized treatment plan.',
    45,
    1500,
    0,
    true
  ),
  (
    v_service_id2,
    v_provider_id,
    'Follow-up Therapy Session',
    '30-minute targeted therapy and rehabilitation session.',
    30,
    1000,
    0,
    true
  );

  insert into public.availability (provider_id, day_of_week, start_time, end_time, active)
  values
    (v_provider_id, 'monday', '09:00', '18:00', true),
    (v_provider_id, 'tuesday', '09:00', '18:00', true),
    (v_provider_id, 'wednesday', '09:00', '18:00', true),
    (v_provider_id, 'thursday', '09:00', '18:00', true),
    (v_provider_id, 'friday', '09:00', '18:00', true),
    (v_provider_id, 'saturday', '10:00', '14:00', true),
    (v_provider_id, 'sunday', '00:00', '00:00', false);

  insert into public.cancellation_policies (
    provider_id,
    cancellation_window,
    fee,
    enabled,
    policy_text
  ) values (
    v_provider_id,
    24,
    200,
    true,
    'Cancellations made at least 24 hours in advance receive a full refund. Rescheduling is free up to 4 hours before the appointment.'
  );

end $$;
