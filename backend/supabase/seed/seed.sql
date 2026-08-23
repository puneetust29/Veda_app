-- Mock data for local dev / demo. Run after 0001_init.sql.
-- Test phone number matches a Supabase Auth "test phone number" (see README) so
-- sign-in with a fixed OTP resolves to this pre-populated telecom profile.

insert into customers (phone_number, full_name, address, telecom_plan, account_number)
values ('+15550001111', 'Alex Morgan', '221B Baker Street, London, UK', 'Unlimited Plus', 'ACC-100234')
on conflict (phone_number) do nothing;

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

-- US-based test customer for Uber MCP testing.
insert into customers (phone_number, full_name, address, telecom_plan, account_number)
values ('+15550003333', 'Jordan Smith', '1201 3rd Ave, Seattle, WA 98101', 'Unlimited Plus', 'ACC-200456')
on conflict (phone_number) do nothing;

-- US-based flight events for Jordan Smith (all depart from US airports — compatible with Uber MCP).
insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Flight to New York', 'flight',
       'Seattle-Tacoma International Airport (SEA)', 'John F. Kennedy International Airport (JFK)',
       now() + interval '3 days', now() + interval '7 days',
       jsonb_build_object('airline', 'Alaska Airlines', 'flight_number', 'AS12', 'destination_country', 'United States')
from customers where phone_number = '+15550003333';

insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Flight to Miami', 'flight',
       'Los Angeles International Airport (LAX)', 'Miami International Airport (MIA)',
       now() + interval '8 days', now() + interval '12 days',
       jsonb_build_object('airline', 'American Airlines', 'flight_number', 'AA1234', 'destination_country', 'United States')
from customers where phone_number = '+15550003333';

insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Flight to London', 'flight',
       'San Francisco International Airport (SFO)', 'London Heathrow (LHR)',
       now() + interval '14 days', now() + interval '21 days',
       jsonb_build_object('airline', 'United Airlines', 'flight_number', 'UA901', 'destination_country', 'United Kingdom')
from customers where phone_number = '+15550003333';

insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Conference in Chicago', 'flight',
       'Denver International Airport (DEN)', 'O''Hare International Airport (ORD)',
       now() + interval '18 days', now() + interval '21 days',
       jsonb_build_object('airline', 'Southwest Airlines', 'flight_number', 'WN445', 'destination_country', 'United States')
from customers where phone_number = '+15550003333';

insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Flight to Atlanta', 'flight',
       'Boston Logan International Airport (BOS)', 'Hartsfield-Jackson Atlanta Airport (ATL)',
       now() + interval '25 days', now() + interval '28 days',
       jsonb_build_object('airline', 'Delta Air Lines', 'flight_number', 'DL987', 'destination_country', 'United States')
from customers where phone_number = '+15550003333';

insert into calendar_events (customer_id, title, event_type, origin, destination, start_datetime, end_datetime, raw_details)
select id, 'Flight to Tokyo', 'flight',
       'Dallas/Fort Worth International Airport (DFW)', 'Tokyo Narita (NRT)',
       now() + interval '35 days', now() + interval '45 days',
       jsonb_build_object('airline', 'American Airlines', 'flight_number', 'AA169', 'destination_country', 'Japan')
from customers where phone_number = '+15550003333';

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
