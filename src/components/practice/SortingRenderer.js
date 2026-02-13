'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './SortingRenderer.module.css';
import QuestionParts from './QuestionParts';
import { isImageUrl, isInlineSvg } from './contentUtils';

function SortableItem({ itemId, index, isAnswered, isSelected, onTap, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
    disabled: isAnswered,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.item} ${isDragging ? styles.dragging : ''} ${isAnswered ? styles.disabled : ''} ${isSelected ? styles.selected : ''}`}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onTap(itemId);
      }}
    >
      <div className={styles.itemContent}>{children}</div>
      <div className={styles.positionBadge}>{index + 1}</div>
    </div>
  );
}

export default function SortingRenderer({
  question,
  userAnswer,
  onAnswer,
  onSubmit,
  isAnswered,
}) {
  const itemIds = useMemo(() => (question.items || []).map((item) => String(item.id)), [question.items]);

  const [items, setItems] = useState(itemIds);
  const [selectedItemId, setSelectedItemId] = useState(null);

  useEffect(() => {
    const normalized = Array.isArray(userAnswer) && userAnswer.length > 0 ? userAnswer.map(String) : itemIds;
    setItems(normalized);
    setSelectedItemId(null);
  }, [question.id, itemIds.join('|')]);

  useEffect(() => {
    if (!userAnswer || userAnswer.length === 0) {
      onAnswer(items);
    }
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8,
      },
    }),
  );

  const getItem = (itemId) => {
    return (question.items || []).find((item) => String(item.id) === String(itemId));
  };

  const renderItemContent = (itemId) => {
    const item = getItem(itemId);
    const content = item?.content || '';

    if (isInlineSvg(content)) {
      return (
        <div
          className={styles.itemMedia}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }

    if (isImageUrl(content)) {
      return (
        <img
          src={content}
          alt={`Sorted item ${itemId}`}
          className={styles.itemImage}
          loading="lazy"
        />
      );
    }

    return <span>{content}</span>;
  };

  const handleDragEnd = (event) => {
    if (isAnswered) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);
    onAnswer(reordered);
    setSelectedItemId(null);
  };

  const handleItemTap = (itemId) => {
    if (isAnswered) return;

    const tappedId = String(itemId);
    if (!selectedItemId) {
      setSelectedItemId(tappedId);
      return;
    }

    if (selectedItemId === tappedId) {
      setSelectedItemId(null);
      return;
    }

    const fromIndex = items.indexOf(selectedItemId);
    const toIndex = items.indexOf(tappedId);
    if (fromIndex < 0 || toIndex < 0) {
      setSelectedItemId(null);
      return;
    }

    const reordered = arrayMove(items, fromIndex, toIndex);
    setItems(reordered);
    onAnswer(reordered);
    setSelectedItemId(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.questionCard}>
        <div className={styles.questionContent}>
          <QuestionParts parts={question.parts} />
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={horizontalListSortingStrategy}>
            <div className={styles.sortingArea}>
              {items.map((itemId, index) => (
                <SortableItem
                  key={itemId}
                  itemId={itemId}
                  index={index}
                  isAnswered={isAnswered}
                  isSelected={selectedItemId === String(itemId)}
                  onTap={handleItemTap}
                >
                  {renderItemContent(itemId)}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {question.showSubmitButton && userAnswer && !isAnswered && (
          <button className={styles.submitButton} onClick={() => onSubmit()}>
            Submit Answer
          </button>
        )}
      </div>
    </div>
  );
}
