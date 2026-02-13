'use client';

import styles from './FillInTheBlankRenderer.module.css';
import { getImageSrc, isImageUrl, isInlineSvg } from './contentUtils';

export default function FillInTheBlankRenderer({
    question,
    userAnswer,
    onAnswer,
    onSubmit,
    isAnswered
}) {
    const handleInputChange = (inputId, value) => {
        const newAnswer = { ...(userAnswer || {}), [inputId]: value };
        onAnswer(newAnswer);
    };

    const renderPart = (part, index) => {
        switch (part.type) {
            case 'text':
                if (isInlineSvg(part.content)) {
                    return (
                        <div
                            key={index}
                            className={styles.imageContainer}
                            dangerouslySetInnerHTML={{ __html: part.content }}
                        />
                    );
                }
                if (isImageUrl(part.content)) {
                    return (
                        <div key={index} className={styles.imageContainer}>
                            <img
                                src={part.content}
                                alt="Question visual"
                                className={styles.image}
                                loading="lazy"
                            />
                        </div>
                    );
                }
                return <span key={index} className={styles.text}>{part.content}</span>;

            case 'image':
                if (isInlineSvg(getImageSrc(part.imageUrl))) {
                    return (
                        <div
                            key={index}
                            className={styles.imageContainer}
                            dangerouslySetInnerHTML={{ __html: getImageSrc(part.imageUrl) }}
                        />
                    );
                }
                return (
                    <div key={index} className={styles.imageContainer}>
                        <img
                            src={getImageSrc(part.imageUrl)}
                            alt="Question image"
                            className={styles.image}
                            style={{
                                width: part.width ? `${part.width}px` : 'auto',
                                height: part.height ? `${part.height}px` : 'auto',
                            }}
                            loading="lazy"
                        />
                    </div>
                );

            case 'sequence':
                return (
                    <div key={index} className={styles.sequence}>
                        {part.children.map((child, childIndex) => renderPart(child, `${index}-${childIndex}`))}
                    </div>
                );

            case 'blank':
            case 'input':
                return (
                    <input
                        key={index}
                        type="text"
                        className={styles.input}
                        value={userAnswer?.[part.id] || ''}
                        onChange={(e) => handleInputChange(part.id, e.target.value)}
                        disabled={isAnswered}
                        style={{ width: part.width || '80px' }}
                    />
                );

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
