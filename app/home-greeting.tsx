'use client';

import {useEffect, useState, type CSSProperties} from 'react';
import {Sparkles} from 'lucide-react';
import {cafeDay, dailyGreeting, isCafeBirthday, nextCafeDay} from '../lib/daily-greeting';
import './home-greeting.css';

const birthdayConfetti = [
  [-20, -35], [1, -52], [25, -42], [50, -30], [70, -11],
  [85, 11], [62, 30], [30, 37], [0, 24], [-24, 13],
];
export default function HomeGreeting({gender, userId, dateOfBirth, title}: {
  gender?: string;
  userId?: string;
  dateOfBirth?: string | null;
  title?: string;
}) {
  const [day, setDay] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = Date.now();
      setDay(cafeDay(now));
      timer = setTimeout(refresh, nextCafeDay(now) - now + 50);
    }
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const birthday = day !== null && isCafeBirthday(day, dateOfBirth);
  const message = title && !birthday ? title : day === null ? 'What sounds good?' : dailyGreeting(gender, day, userId, dateOfBirth);
  const openingPhrase = message.match(/^.{1,40}?[.!?](?=\s|$)/)?.[0] || '';
  const phrases = openingPhrase
    ? [openingPhrase, message.slice(openingPhrase.length).trim()]
    : ['', message];

  return (
    <h1 className={birthday ? 'greeting birthday-greeting' : 'greeting'} aria-label={message} data-greeting-ready={day !== null}>
      {birthday && (
        <span className="birthday-greeting-emblem" aria-hidden="true">
          <span className="birthday-greeting-sparkle">
            <Sparkles size={20} strokeWidth={1.6} />
          </span>
          <span className="birthday-greeting-confetti">
            {birthdayConfetti.map(([x, y]) => (
              <i key={x} style={{'--burst-x': `${x}px`, '--burst-y': `${y}px`} as CSSProperties} />
            ))}
          </span>
        </span>
      )}
      <span key={message} className="greeting-copy" aria-hidden="true">
        {phrases.map((phrase, phraseIndex) => phrase && (
          <span key={phraseIndex} className={phraseIndex === 0 ? 'greeting-lead' : 'greeting-rest'}>
            {phrase.split(/\s+/).map((word, index) => (
              <span key={index} className="greeting-word-wrap">
                <span className="greeting-word">{word}</span>
                {' '}
              </span>
            ))}
          </span>
        ))}
      </span>
    </h1>
  );
}
