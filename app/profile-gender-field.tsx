import {genderOptions} from '../lib/daily-greeting';

export default function ProfileGenderField({value, onChange, disabled, editProfile = false, required = false}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  editProfile?: boolean;
  required?: boolean;
}) {
  const options = genderOptions.filter(([key]) => key !== 'nonbinary');
  const selected = editProfile && !options.some(([key]) => key === value) ? 'undisclosed' : value;

  return (
    <label>
      {required ? 'Gender *' : 'Gender (optional)'}
      <select className="pin-profile-input" value={selected} onChange={event => onChange(event.target.value)} disabled={disabled} required={required}>
        {!editProfile && <option value="">Select an option</option>}
        {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}
