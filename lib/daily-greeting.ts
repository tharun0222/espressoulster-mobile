import {dailyCompliments} from './daily-compliments.ts';
import {birthdayWishes} from './birthday-wishes.ts';

export const genderOptions = [
  ['male', 'Male'],
  ['female', 'Female'],
  ['nonbinary', 'Non-binary'],
  ['undisclosed', 'Prefer not to say'],
] as const;

export function isProfileGender(value: unknown) {
  return value === '' || genderOptions.some(([key]) => key === value);
}

const greetings = {
  male: dailyCompliments.male,
  female: dailyCompliments.female,
  neutral: ['Hello, coffee lover!', 'Good to see you!', 'What are we sipping today?', 'Hello, sunshine!', 'What sounds good?', 'Time for something delicious?', 'Fancy a coffee?'],
};

const dayMs = 86_400_000;
const indiaOffsetMs = 330 * 60_000;

export function cafeDay(now: number) {
  return Math.floor((now + indiaOffsetMs) / dayMs);
}

export function nextCafeDay(now: number) {
  return (cafeDay(now) + 1) * dayMs - indiaOffsetMs;
}

export function isCafeBirthday(day: number, dateOfBirth?: string | null) {
  // The café day is already shifted to Bengaluru time. Read its date in UTC.
  return Boolean(dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
    && dateOfBirth.slice(5) === new Date(day * dayMs).toISOString().slice(5, 10));
}

export function dailyGreeting(gender: unknown, day: number, userId = '', dateOfBirth?: string | null) {
  const birthday = isCafeBirthday(day, dateOfBirth);
  const collection = birthday ? birthdayWishes : greetings;
  const lines = collection[gender === 'male' || gender === 'female' ? gender : 'neutral'];
  const rotation = birthday ? new Date(day * dayMs).getUTCFullYear() : day;
  let hash = 0;
  for (const character of userId) {
    hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0;
  }
  const index = (rotation + hash % lines.length) % lines.length;
  return lines[(index + lines.length) % lines.length];
}
