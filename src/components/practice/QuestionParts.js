'use client';

import styles from './QuestionParts.module.css';
import { getImageSrc, isImageUrl, isInlineSvg } from './contentUtils';

function renderInlineMarkdown(text) {
    const normalized = String(text ?? '');
    if (!normalized) return null;

    const tokens = normalized.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);

    return tokens.map((token, idx) => {
        if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
            return <strong key={`md-b-${idx}`}>{token.slice(2, -2)}</strong>;
        }
        if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
            return <em key={`md-i-${idx}`}>{token.slice(1, -1)}</em>;
        }
        if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
            return <code key={`md-c-${idx}`}>{token.slice(1, -1)}</code>;
        }
        return <span key={`md-t-${idx}`}>{token}</span>;
    });
}

export default function QuestionParts({ parts }) {
    const renderPart = (part, index) => {
        const imageSrc = getImageSrc(part?.imageUrl || part?.content);

        switch (part.type) {
            case 'text':
                if (isInlineSvg(part.content)) {
                    return (
                        <div
                            key={index}
                            className={styles.svgContainer}
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
                                className={styles.urlImage}
                                loading="lazy"
                            />
                        </div>
                    );
                }
                return (
                    <span key={index} className={styles.text}>
                        {renderInlineMarkdown(part.content)}
                    </span>
                );

            case 'image':
                if (isInlineSvg(imageSrc)) {
                    return (
                        <div
                            key={index}
                            className={styles.svgContainer}
                            dangerouslySetInnerHTML={{ __html: imageSrc }}
                        />
                    );
                }
                return (
                    <div key={index} className={styles.imageContainer}>
                        <img
                            src={imageSrc}
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

            case 'svg':
                return (
                    <div
                        key={index}
                        className={styles.svgContainer}
                        dangerouslySetInnerHTML={{ __html: part.content }}
                    />
                );

            case 'sequence':
                return (
                    <div key={index} className={styles.sequence}>
                        {part.children.map((child, childIndex) => renderPart(child, `${index}-${childIndex}`))}
                    </div>
                );

            case 'input':
                // Input rendering handled by FillInTheBlank renderer
                return null;

            case 'math':
                // TODO: Implement KaTeX rendering
                return (
                    <span key={index} className={styles.math}>
                        {part.content}
                    </span>
                );

            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
            {parts.map((part, index) => renderPart(part, index))}
        </div>
    );
}
