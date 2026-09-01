-- Mock data for local dev / demo. Run after 0001_init.sql.
-- Test phone number matches a Supabase Auth "test phone number" (see README) so
-- sign-in with a fixed OTP resolves to this pre-populated telecom profile.

insert into customers (phone_number, full_name, address, telecom_plan, account_number, otp)
values ('+15550001111', 'Alex Morgan', '221B Baker Street, London, UK', 'Unlimited Plus', 'ACC-100234', NULL)
on conflict (phone_number) do update set otp = NULL;

-- Test user for OTP verification testing
insert into customers (phone_number, full_name, address, telecom_plan, account_number, otp)
values ('+15550005555', 'Ranadheer G', '1 Market Street, San Francisco, CA, USA', 'Standard Mobile', '+15550005555', '500005')
on conflict (phone_number) do update set otp = '500005';

-- Calendar events (mocked "calendar read") for Alex Morgan.
insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Flight to Tokyo', 'flight', 'London Heathrow (LHR)', 'Tokyo Narita (NRT)',
       now() + interval '5 days', now() + interval '19 days',
       jsonb_build_object('airline', 'ANA', 'flight_number', 'NH205', 'destination_country', 'Japan')
from customers where phone_number = '+15550001111';

insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Flight to Marrakesh', 'flight', 'London Gatwick (LGW)', 'Marrakesh Menara (RAK)',
       now() + interval '30 days', now() + interval '44 days',
       jsonb_build_object('airline', 'EasyJet', 'flight_number', 'U28321', 'destination_country', 'Morocco')
from customers where phone_number = '+15550001111';

insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Weekend in Paris', 'flight', 'London St Pancras', 'Paris Gare du Nord',
       now() + interval '10 days', now() + interval '12 days',
       jsonb_build_object('operator', 'Eurostar', 'destination_country', 'France')
from customers where phone_number = '+15550001111';

-- Roaming plan catalog (mocked telecom roaming product API).
insert into roaming_plans (country_code, country_name, region, duration_days, data_gb, price, currency, plan_name, description) values
('JP', 'Japan', 'Asia', 7, 5, 25.00, 'EUR', 'Asia Explorer 7', '5GB data, calls & texts for 7 days in Japan'),
('JP', 'Japan', 'Asia', 14, 12, 42.00, 'EUR', 'Asia Explorer 14', '12GB data, calls & texts for 14 days in Japan'),
('JP', 'Japan', 'Asia', 30, 25, 75.00, 'EUR', 'Asia Explorer 30', '25GB data, calls & texts for 30 days in Japan'),
('MA', 'Morocco', 'Africa', 7, 3, 20.00, 'EUR', 'Africa Roam 7', '3GB data, calls & texts for 7 days in Morocco'),
('MA', 'Morocco', 'Africa', 14, 8, 38.00, 'EUR', 'Africa Roam 14', '8GB data, calls & texts for 14 days in Morocco'),
('MA', 'Morocco', 'Africa', 30, 15, 65.00, 'EUR', 'Africa Roam 30', '15GB data, calls & texts for 30 days in Morocco'),
('FR', 'France', 'Europe', 30, 999, 0.00, 'EUR', 'EU Roam Like Home', 'Included in Unlimited Plus — use your home allowance across the EU at no extra cost'),
('US', 'United States', 'North America', 7, 4, 30.00, 'EUR', 'USA Roam 7', '4GB data, calls & texts for 7 days in the USA'),
('US', 'United States', 'North America', 14, 10, 55.00, 'EUR', 'USA Roam 14', '10GB data, calls & texts for 14 days in the USA'),
('IN', 'India', 'Asia', 7, 4, 22.00, 'EUR', 'Asia Explorer India 7', '4GB data, calls & texts for 7 days in India'),
('IN', 'India', 'Asia', 14, 10, 40.00, 'EUR', 'Asia Explorer India 14', '10GB data, calls & texts for 14 days in India')
on conflict do nothing;
