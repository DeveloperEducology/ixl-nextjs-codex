'use client';

import { useEffect, useRef } from 'react';
import styles from './FillInTheBlankRenderer.module.css';
import { getImageSrc, hasInlineHtml, isImageUrl, isInlineSvg, sanitizeInlineHtml } from './contentUtils';
import SpeakerButton from './SpeakerButton';
import SafeImage from './SafeImage';

export default function FillInTheBlankRenderer({
    question,
    userAnswer,
    onAnswer,
    onSubmit,
    isAnswered
}) {
    const arithmeticCellRefs = useRef({});

    const getRepeatCount = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return 1;
        return Math.min(Math.floor(parsed), 24);
    };

    const parseCorrectAnswers = () => {
        try {
            const parsed = JSON.parse(question.correctAnswerText || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    };

    const correctAnswers = parseCorrectAnswers();

    const getInputConfig = (part) => {
        const declaredType = String(part?.answerType || part?.answer_type || '').toLowerCase();
        if (declaredType === 'number' || declaredType === 'numeric') {
            return { inputMode: 'numeric', pattern: '[0-9]*' };
        }
        if (declaredType === 'decimal') {
            return { inputMode: 'decimal', pattern: '[-+]?[0-9]*[.]?[0-9]+' };
        }

        const expected = correctAnswers?.[part.id];
        if (typeof expected === 'number') {
            return Number.isInteger(expected)
                ? { inputMode: 'numeric', pattern: '[0-9]*' }
                : { inputMode: 'decimal', pattern: '[-+]?[0-9]*[.]?[0-9]+' };
        }

        if (typeof expected === 'string') {
            const trimmed = expected.trim();
            if (/^-?\d+$/.test(trimmed)) {
                return { inputMode: 'numeric', pattern: '[-]?[0-9]*' };
            }
            if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
                return { inputMode: 'decimal', pattern: '[-+]?[0-9]*[.]?[0-9]+' };
            }
        }

        return { inputMode: 'text', pattern: undefined };
    };

    const handleInputChange = (inputId, value) => {
        const newAnswer = { ...(userAnswer || {}), [inputId]: value };
        onAnswer(newAnswer);
    };

    const getCellInputConfig = (cell) => {
        const rawType = String(cell?.type || cell?.answerType || '').toLowerCase();
        if (rawType === 'digit') return { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 1 };
        if (rawType === 'number' || rawType === 'numeric') return { inputMode: 'numeric', pattern: '[-]?[0-9]*', maxLength: 6 };
        return { inputMode: 'text', pattern: undefined, maxLength: 1 };
    };

    const renderArithmeticLayout = (part) => {
        const rows = Array.isArray(part?.layout?.rows) ? part.layout.rows : [];
        const measureColumns = (text) => String(text || '').replace(/\s+/g, '').length;
        const maxColumns = rows.reduce((max, row) => {
            const kind = String(row?.kind || '').toLowerCase();
            if (kind === 'answer') {
                const cells = Array.isArray(row?.cells) ? row.cells.length : 0;
                const prefixWidth = measureColumns(row?.prefix || '');
                return Math.max(max, prefixWidth + cells);
            }
            if (kind === 'divider') return max;
            return Math.max(max, measureColumns(row?.text || ''));
        }, 0);

        const renderTextGrid = (text) => {
            const compact = String(text || '').replace(/\s+/g, '');
            const chars = compact.split('');
            const pad = Math.max(0, maxColumns - chars.length);
            return (
                <div className={styles.arGridRow} style={{ '--cols': maxColumns }}>
                    {Array.from({ length: pad }).map((_, i) => (
                        <span key={`pad-${i}`} className={styles.arGridCell} />
                    ))}
                    {chars.map((ch, i) => (
                        <span key={`ch-${i}`} className={styles.arGridCell}>{ch}</span>
                    ))}
                </div>
            );
        };

        return (
            <div className={styles.arithmeticLayout} style={{ '--cols': maxColumns }}>
                {rows.map((row, rowIndex) => {
                    const kind = String(row?.kind || '').toLowerCase();

                    if (kind === 'divider') {
                        return <div key={`ar-row-${rowIndex}`} className={styles.arDivider} />;
                    }

                    if (kind === 'answer') {
                        const cells = Array.isArray(row?.cells) ? row.cells : [];
                        const prefix = String(row?.prefix || '').replace(/\s+/g, '');
                        const prefixChars = prefix.split('');
                        const usedColumns = prefixChars.length + cells.length;
                        const leftPad = Math.max(0, maxColumns - usedColumns);
                        return (
                            <div key={`ar-row-${rowIndex}`} className={styles.arAnswerRow}>
                                <div className={styles.arGridRow} style={{ '--cols': maxColumns }}>
                                    {Array.from({ length: leftPad }).map((_, i) => (
                                        <span key={`ans-pad-${i}`} className={styles.arGridCell} />
                                    ))}
                                    {prefixChars.map((ch, i) => (
                                        <span key={`pre-${i}`} className={`${styles.arGridCell} ${styles.arPrefixCell}`}>{ch}</span>
                                    ))}
                                    {cells.map((cell, cellIndex) => {
                                        const id = String(cell?.id || `cell_${rowIndex}_${cellIndex}`);
                                        const cfg = getCellInputConfig(cell);
                                        return (
                                            <span key={id} className={styles.arGridCell}>
                                                <input
                                                    ref={(el) => {
                                                        if (el) arithmeticCellRefs.current[id] = el;
                                                    }}
                                                    type="text"
                                                    className={styles.arCellInput}
                                                    value={userAnswer?.[id] || ''}
                                                    onChange={(e) => {
                                                        let next = e.target.value.toUpperCase();
                                                        if (cfg.inputMode === 'numeric' || cfg.pattern?.includes('[0-9]')) {
                                                            next = next.replace(/[^0-9-]/g, '');
                                                        }
                                                        next = next.slice(0, 8);

                                                        // Support paste/multi-digit entry: fill current and move left.
                                                        if (next.length > 1) {
                                                            const chars = next.slice(0, cells.length).split('');
                                                            const updates = { ...(userAnswer || {}) };
                                                            let cursor = cellIndex;
                                                            chars.forEach((char) => {
                                                                if (cursor < 0) return;
                                                                const targetId = String(cells[cursor]?.id || `cell_${rowIndex}_${cursor}`);
                                                                updates[targetId] = char;
                                                                cursor -= 1;
                                                            });
                                                            onAnswer(updates);
                                                            const focusId = String(cells[Math.max(0, cellIndex - chars.length)]?.id || `cell_${rowIndex}_${Math.max(0, cellIndex - chars.length)}`);
                                                            arithmeticCellRefs.current[focusId]?.focus();
                                                            return;
                                                        }

                                                        next = next.slice(0, cfg.maxLength);
                                                        handleInputChange(id, next);

                                                        // Move cursor from ones -> tens -> hundreds (right to left).
                                                        if (next && cellIndex > 0) {
                                                            const leftId = String(cells[cellIndex - 1]?.id || `cell_${rowIndex}_${cellIndex - 1}`);
                                                            arithmeticCellRefs.current[leftId]?.focus();
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        const currentVal = String(userAnswer?.[id] || '');
                                                        if (e.key === 'Backspace' && !currentVal && cellIndex < cells.length - 1) {
                                                            const rightId = String(cells[cellIndex + 1]?.id || `cell_${rowIndex}_${cellIndex + 1}`);
                                                            arithmeticCellRefs.current[rightId]?.focus();
                                                        }
                                                    }}
                                                    onFocus={(e) => e.target.select()}
                                                    disabled={isAnswered}
                                                    inputMode={cfg.inputMode}
                                                    pattern={cfg.pattern}
                                                    maxLength={cfg.maxLength}
                                                />
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }

                    const text = String(row?.text || '');
                    if (!text) return null;
                    return (
                        <div key={`ar-row-${rowIndex}`} className={styles.arTextRow}>
                            {renderTextGrid(text)}
                        </div>
                    );
                })}
            </div>
        );
    };

    useEffect(() => {
        // Focus ones place (right-most cell) on new question.
        const arithmeticPart = (question?.parts || []).find((part) => part?.type === 'arithmeticLayout');
        const rows = Array.isArray(arithmeticPart?.layout?.rows) ? arithmeticPart.layout.rows : [];
        const answerRow = rows.find((row) => String(row?.kind || '').toLowerCase() === 'answer');
        const cells = Array.isArray(answerRow?.cells) ? answerRow.cells : [];
        if (cells.length === 0) return;

        const onesId = String(cells[cells.length - 1]?.id || `cell_0_${cells.length - 1}`);
        const target = arithmeticCellRefs.current[onesId];
        if (target && !isAnswered) {
            target.focus();
        }
    }, [question?.id, isAnswered]);

    const wrapPart = (part, index, content) => {
        if (content === null) return null;
        const isVertical = Boolean(part?.isVertical);
        return (
            <div
                key={`wrap-${index}`}
                className={`${styles.partWrapper} ${isVertical ? styles.verticalPart : styles.inlinePart}`}
            >
                {content}
            </div>
        );
    };

    const renderPart = (part, index) => {
        switch (part.type) {
            case 'text':
                if (isInlineSvg(part.content)) {
                    return wrapPart(part, index, (
                        <div
                            className={styles.imageContainer}
                            dangerouslySetInnerHTML={{ __html: part.content }}
                        />
                    ));
                }
                if (isImageUrl(part.content)) {
                    return wrapPart(part, index, (
                        <div key={index} className={styles.imageContainer}>
                            <SafeImage
                                src={part.content}
                                alt="Question visual"
                                className={styles.image}
                                width={220}
                                height={150}
                                sizes="(max-width: 768px) 44vw, 220px"
                            />
                        </div>
                    ));
                }
                return wrapPart(part, index, (
                    <span className={styles.textWithSpeaker}>
                        {Boolean(part?.hasAudio) && (
                            <SpeakerButton text={part.content} className={styles.inlineSpeaker} />
                        )}
                        {hasInlineHtml(part.content) ? (
                            <span
                                className={styles.text}
                                dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(part.content) }}
                            />
                        ) : (
                            <span className={styles.text}>{part.content}</span>
                        )}
                    </span>
                ));

            case 'image':
                if (isInlineSvg(getImageSrc(part.imageUrl))) {
                    const repeatCount = getRepeatCount(part?.count);
                    return wrapPart(part, index, (
                        <div className={styles.imageContainer}>
                            {Array.from({ length: repeatCount }).map((_, imageIndex) => (
                                <div
                                    key={`svg-${index}-${imageIndex}`}
                                    dangerouslySetInnerHTML={{ __html: getImageSrc(part.imageUrl) }}
                                />
                            ))}
                        </div>
                    ));
                }
                const repeatCount = getRepeatCount(part?.count);
                return wrapPart(part, index, (
                    <div className={styles.imageContainer}>
                        {Array.from({ length: repeatCount }).map((_, imageIndex) => (
                            <SafeImage
                                key={`img-${index}-${imageIndex}`}
                                src={getImageSrc(part.imageUrl)}
                                alt={`Question image ${imageIndex + 1}`}
                                className={styles.image}
                                width={220}
                                height={150}
                                style={{
                                    width: part.width ? `${part.width}px` : 'auto',
                                    height: part.height ? `${part.height}px` : 'auto',
                                }}
                                sizes="(max-width: 768px) 44vw, 220px"
                            />
                        ))}
                    </div>
                ));

            case 'sequence':
                return wrapPart(part, index, (
                    <div className={styles.sequence}>
                        {part.children.map((child, childIndex) => renderPart(child, `${index}-${childIndex}`))}
                    </div>
                ));

            case 'blank':
            case 'input':
                const inputConfig = getInputConfig(part);
                return wrapPart(part, index, (
                    <input
                        type="text"
                        className={styles.input}
                        value={userAnswer?.[part.id] || ''}
                        onChange={(e) => handleInputChange(part.id, e.target.value)}
                        disabled={isAnswered}
                        style={{ width: part.width || '80px' }}
                        inputMode={inputConfig.inputMode}
                        pattern={inputConfig.pattern}
                    />
                ));

            case 'arithmeticLayout':
                return wrapPart(part, index, renderArithmeticLayout(part));

            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.questionCard}>
                <div className={styles.questionContent}>
                    {question.parts.map((part, index) => renderPart(part, index))}
                </div>

                {question.showSubmitButton && userAnswer && !isAnswered && (
                    <button className={styles.submitButton} onClick={() => onSubmit()}>
                        Submit Answer
                    </button>
                )}
            </div>
        </div>
    );
}
