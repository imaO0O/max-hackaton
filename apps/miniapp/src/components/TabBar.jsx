import { hapticSelection } from '../lib/max-bridge.js';

export const TABS = [
  { id: 'paths', title: 'Два пути', icon: '🔀' },
  { id: 'grades', title: 'Балл', icon: '🧮' },
  { id: 'colleges', title: 'Колледжи', icon: '🏫' },
  { id: 'plan', title: 'Мой план', icon: '🗓️' },
  { id: 'next', title: 'Дальше', icon: '🎓' },
];

export function TabBar({ value, onChange }) {
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`tabbar__item ${value === tab.id ? 'tabbar__item--active' : ''}`}
          aria-current={value === tab.id ? 'page' : undefined}
          onClick={() => {
            if (tab.id !== value) hapticSelection();
            onChange(tab.id);
          }}
        >
          <span className="tabbar__icon" aria-hidden="true">{tab.icon}</span>
          <span className="tabbar__title">{tab.title}</span>
        </button>
      ))}
    </nav>
  );
}
