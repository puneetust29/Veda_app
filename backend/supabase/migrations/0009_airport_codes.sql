-- Create airport_codes reference table for caching country lookups
create table if not exists airport_codes (
    id bigint primary key generated always as identity,
    code text not null unique,
    country_name text not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table airport_codes enable row level security;

create index idx_airport_codes_code on airport_codes(code);

-- RLS Policy: Allow authenticated users to READ (no INSERT/UPDATE/DELETE)
create policy "Allow authenticated users to read airport codes"
    on airport_codes
    for select
    using (auth.role() = 'authenticated');

-- RLS Policy: Allow service role (backend) to INSERT/UPDATE
create policy "Allow service role to manage airport codes"
    on airport_codes
    for insert
    with check (auth.role() = 'service_role');

create policy "Allow service role to update airport codes"
    on airport_codes
    for update
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- Seed common airports
insert into airport_codes (code, country_name) values
-- United States
('JFK', 'United States'),
('LGA', 'United States'),
('EWR', 'United States'),
('ORD', 'United States'),
('LAX', 'United States'),
('SFO', 'United States'),
('DEN', 'United States'),
('ATL', 'United States'),
('DFW', 'United States'),
('MIA', 'United States'),
('BOS', 'United States'),
('SEA', 'United States'),
('LAS', 'United States'),
('PHX', 'United States'),
('IAD', 'United States'),
('IAH', 'United States'),
('DAL', 'United States'),
('PHL', 'United States'),

-- Europe
('CDG', 'France'),
('ORY', 'France'),
('LHR', 'United Kingdom'),
('LGW', 'United Kingdom'),
('FCO', 'Italy'),
('MXP', 'Italy'),
('MAD', 'Spain'),
('VY', 'Spain'),
('AMS', 'Netherlands'),
('TXL', 'Germany'),
('BER', 'Germany'),
('MUC', 'Germany'),
('FRA', 'Germany'),
('ZRH', 'Switzerland'),
('GVA', 'Switzerland'),
('VIE', 'Austria'),
('PRG', 'Czech Republic'),
('WAW', 'Poland'),
('DUB', 'Ireland'),
('MAN', 'United Kingdom'),
('BHX', 'United Kingdom'),
('LBA', 'United Kingdom'),
('EDI', 'United Kingdom'),
('ARI', 'Greece'),
('BCN', 'Spain'),
('BIO', 'Spain'),
('TFS', 'Spain'),
('IBZ', 'Spain'),
('PMI', 'Spain'),
('VLC', 'Spain'),
('SVQ', 'Spain'),

-- Asia Pacific
('PVG', 'China'),
('SHA', 'China'),
('PEK', 'China'),
('CAN', 'China'),
('CTU', 'China'),
('CKG', 'China'),
('XIY', 'China'),
('HGH', 'China'),
('NKG', 'China'),
('KMG', 'China'),
('HND', 'Japan'),
('NRT', 'Japan'),
('KIX', 'Japan'),
('ICN', 'South Korea'),
('GMP', 'South Korea'),
('PUS', 'South Korea'),
('SGN', 'Vietnam'),
('DAD', 'Vietnam'),
('HAN', 'Vietnam'),
('BKK', 'Thailand'),
('DMK', 'Thailand'),
('SIN', 'Singapore'),
('KUL', 'Malaysia'),
('CGK', 'Indonesia'),
('DPS', 'Indonesia'),
('HKG', 'Hong Kong'),
('TPE', 'Taiwan'),
('DEL', 'India'),
('BOM', 'India'),
('MAA', 'India'),
('BLR', 'India'),
('SYD', 'Australia'),
('MEL', 'Australia'),
('BNE', 'Australia'),
('PER', 'Australia'),
('AKL', 'New Zealand'),
('CHC', 'New Zealand'),

-- Middle East & Africa
('DXB', 'United Arab Emirates'),
('AUH', 'United Arab Emirates'),
('DIA', 'United Arab Emirates'),
('DOH', 'Qatar'),
('JED', 'Saudi Arabia'),
('RUH', 'Saudi Arabia'),
('KWI', 'Kuwait'),
('BAH', 'Bahrain'),
('MCT', 'Oman'),
('CAI', 'Egypt'),
('JNB', 'South Africa'),
('CPT', 'South Africa'),
('NBO', 'Kenya'),

-- Latin America
('MEX', 'Mexico'),
('CUN', 'Mexico'),
('MID', 'Mexico'),
('GDL', 'Mexico'),
('MTY', 'Mexico'),
('PUJ', 'Dominican Republic'),
('SJD', 'Mexico'),
('PTY', 'Panama'),
('MDE', 'Colombia'),
('BOG', 'Colombia'),
('CTG', 'Colombia'),
('CCS', 'Venezuela'),
('BRC', 'Argentina'),
('AEP', 'Argentina'),
('EZE', 'Argentina'),
('ROS', 'Argentina'),
('MVD', 'Uruguay'),
('SCL', 'Chile'),
('PMC', 'Chile'),
('IQT', 'Ecuador'),
('UIO', 'Ecuador'),
('LIM', 'Peru'),
('SJO', 'Costa Rica'),
('BZE', 'Belize'),
('BGI', 'Barbados'),
('MBJ', 'Jamaica'),
('KIN', 'Jamaica'),
('VVI', 'Bolivia'),
('ASU', 'Paraguay'),
('FOR', 'Brazil'),
('GIG', 'Brazil'),
('GRU', 'Brazil'),
('SAO', 'Brazil'),
('BSB', 'Brazil'),
('CNF', 'Brazil'),
('REC', 'Brazil'),
('SSA', 'Brazil')
on conflict (code) do nothing;
