// Time zone select: every IANA zone the browser knows, each shown with its current UTC offset.
//
// Contents:
//   TimeZoneField: A labeled select of IANA zones; keeps an unknown saved value selectable.
import { useMemo } from 'react';
import { allTimeZones, formatZone } from '../lib/time';
import { SelectField } from './Field';

/** A labeled select of IANA zones; keeps an unknown saved value selectable. */
export function TimeZoneField({ value, error, onChange }: { value: string; error?: string | undefined; onChange: (zone: string) => void }) {
  const all = useMemo(() => allTimeZones().map((zone) => [zone, formatZone(zone)] as const), []);
  const zones = useMemo(() => (all.some(([zone]) => zone === value) ? all : [[value, formatZone(value)] as const, ...all]),
    [all, value]);
  return (
    <SelectField label="Time zone" hint="Used to rank teammates by working-hour overlap." value={value} error={error}
      onChange={(event) => onChange(event.target.value)}>
      {zones.map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
    </SelectField>
  );
}
