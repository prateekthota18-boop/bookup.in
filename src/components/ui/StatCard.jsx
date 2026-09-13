import { useEffect, useState } from 'react';

export default function StatCard({
  label,
  value,
  subtitle,
  subtext,
  icon,
  arrowUp = false,
  highlight = false,
  isActive = false,
  onClick,
  style = {},
  className = '',
}) {
  const finalSubtitle = subtitle || subtext;
  const isSelected = highlight || isActive;

  // Count-up animation for numeric values
  const numericValue = typeof value === 'number' ? value : parseInt(value, 10);
  const isPureNumber = !isNaN(numericValue) && String(numericValue) === String(value).trim();
  const [displayValue, setDisplayValue] = useState(isPureNumber ? 0 : value);

  useEffect(() => {
    if (!isPureNumber) {
      setDisplayValue(value);
      return;
    }

    let start = 0;
    const end = numericValue;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const duration = 600;
    const stepTime = Math.max(16, Math.floor(duration / Math.max(1, end)));
    const timer = setInterval(() => {
      start += Math.ceil(end / 20) || 1;
      if (start >= end) {
        setDisplayValue(end);
        clearInterval(timer);
      } else {
        setDisplayValue(start);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value, isPureNumber, numericValue]);

  return (
    <div
      className={`stat-card-janjiyuk ${className}`}
      onClick={onClick}
      style={{
        border: isSelected ? '1.5px solid var(--color-lime)' : undefined,
        background: isSelected ? 'var(--color-lime-light)' : undefined,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      <div className="stat-card-header">
        {icon && <span className="stat-card-icon-wrap">{icon}</span>}
        <span style={{ fontWeight: 600 }}>{label}</span>
      </div>

      <div className="stat-card-value">
        <span>{displayValue}</span>
        {arrowUp && <span className="stat-card-arrow-up">↑</span>}
      </div>

      {finalSubtitle && <div className="stat-card-subtext">{finalSubtitle}</div>}
    </div>
  );
}
