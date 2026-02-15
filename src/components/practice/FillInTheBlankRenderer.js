'use client';

import styles from './FillInTheBlankRenderer.module.css';
import { getImageSrc, hasInlineHtml, isImageUrl, isInlineSvg, sanitizeInlineHtml } from './contentUtils';
import SpeakerButton from './SpeakerButton';

export default function FillInTheBlankRenderer({
    question,
    userAnswer,
    onAnswer,
    onSubmit,
    isAnswered
}) {
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
                            <img
                                src={part.content}
                                alt="Question visual"
                                className={styles.image}
                                loading="lazy"
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
                            <img
                                key={`img-${index}-${imageIndex}`}
                                src={getImageSrc(part.imageUrl)}
                                alt={`Question image ${imageIndex + 1}`}
                                className={styles.image}
                                style={{
                                    width: part.width ? `${part.width}px` : 'auto',
                                    height: part.height ? `${part.height}px` : 'auto',
                                }}
                                loading="lazy"
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
