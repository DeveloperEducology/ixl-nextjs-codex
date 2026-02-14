'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QuestionParts from './QuestionParts';
import styles from './MeasureRenderer.module.css';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function MeasureRenderer({
  question,
  userAnswer,
  onAnswer,
  onSubmit,
  isAnswered,
}) {
  const unit = String(question.adaptiveConfig?.unit || 'cm');
  const objectWidth = Number(question.adaptiveConfig?.object_width || 280);
  const correctValue = Number(question.correctAnswerText || 0);

  const [areaWidth, setAreaWidth] = useState(null);
  const maxUnits = useMemo(() => {
    const configured = Number(
      question.adaptiveConfig?.max_units ??
      question.adaptiveConfig?.total_units ??
      10
    );
    if (Number.isFinite(configured) && configured > 0) {
      return clamp(Math.round(configured), 1, 50);
    }
    return 10;
  }, [question.adaptiveConfig]);

  const effectiveRulerWidth = useMemo(() => {
    if (!Number.isFinite(areaWidth) || areaWidth <= 0) return objectWidth;
    const available = Math.max(120, areaWidth - 20);
    return Math.min(objectWidth, available);
  }, [areaWidth, objectWidth]);

  const normalizedCorrect = Number.isFinite(correctValue) ? clamp(correctValue, 0, maxUnits) : 0;
  const tickWidth = effectiveRulerWidth / maxUnits;
  const lineWidth = clamp(
    Number.isFinite(normalizedCorrect) ? normalizedCorrect * tickWidth : objectWidth * 0.6,
    30,
    effectiveRulerWidth
  );

  const areaRef = useRef(null);
  const rulerRef = useRef(null);
  const [rulerPosition, setRulerPosition] = useState({ x: 12, y: 86 });
  const [dragStart, setDragStart] = useState(null);

  const handlePointerDown = (event) => {
    if (isAnswered) return;
    const rulerRect = rulerRef.current?.getBoundingClientRect();
    if (!rulerRect) return;

    setDragStart({
      x: event.clientX - rulerRect.left,
      y: event.clientY - rulerRect.top,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragStart || isAnswered) return;

    const areaRect = areaRef.current?.getBoundingClientRect();
    const rulerRect = rulerRef.current?.getBoundingClientRect();
    if (!areaRect || !rulerRect) return;

    const maxX = Math.max(0, areaRect.width - rulerRect.width);
    const maxY = Math.max(0, areaRect.height - rulerRect.height);

    const nextX = clamp(event.clientX - areaRect.left - dragStart.x, 0, maxX);
    const nextY = clamp(event.clientY - areaRect.top - dragStart.y, 0, maxY);

    setRulerPosition({ x: nextX, y: nextY });
  };

  const stopDragging = () => {
    setDragStart(null);
  };

  useEffect(() => {
    if (!areaRef.current) return;

    const el = areaRef.current;
    const updateSize = () => {
      setAreaWidth(el.clientWidth);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!areaRef.current || !rulerRef.current) return;
    const areaRect = areaRef.current.getBoundingClientRect();
    const rulerRect = rulerRef.current.getBoundingClientRect();

    const maxX = Math.max(0, areaRect.width - rulerRect.width);
    const maxY = Math.max(0, areaRect.height - rulerRect.height);
    setRulerPosition((prev) => ({
      x: clamp(prev.x, 0, maxX),
      y: clamp(prev.y, 0, maxY),
    }));
  }, [effectiveRulerWidth]);

  return (
    <div className={styles.container}>
      <div className={styles.questionCard}>
        <div className={styles.questionContent}>
          <QuestionParts parts={question.parts} />
        </div>

        <div
          ref={areaRef}
          className={styles.measureArea}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onPointerLeave={stopDragging}
        >
          <div className={styles.line} style={{ width: `${lineWidth}px` }} />

          <div
            ref={rulerRef}
            className={styles.ruler}
            style={{
              width: `${effectiveRulerWidth}px`,
              transform: `translate(${rulerPosition.x}px, ${rulerPosition.y}px)`,
            }}
            onPointerDown={handlePointerDown}
          >
            {Array.from({ length: maxUnits + 1 }).map((_, idx) => (
              <div
                key={idx}
                className={`${styles.tick} ${idx === 0 ? styles.tickStart : ''} ${idx === maxUnits ? styles.tickEnd : ''}`}
                style={{ left: `${(idx / maxUnits) * 100}%` }}
              >
                <div className={styles.tickMark} />
                <span className={`${styles.tickLabel} ${idx === 0 ? styles.tickLabelStart : ''} ${idx === maxUnits ? styles.tickLabelEnd : ''}`}>
                  {idx}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.answerRow}>
          <span className={styles.answerLabel}>The line is about</span>
          <input
            type="text"
            className={styles.answerInput}
            value={userAnswer || ''}
            onChange={(e) => onAnswer(e.target.value)}
            disabled={isAnswered}
            inputMode="numeric"
          />
          <span className={styles.answerLabel}>{unit} long.</span>
        </div>

        {question.showSubmitButton && userAnswer && !isAnswered && (
          <button className={styles.submitButton} onClick={() => onSubmit()}>
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
