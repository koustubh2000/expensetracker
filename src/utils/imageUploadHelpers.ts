import React, { useEffect, useState } from 'react';

/**
 * Extracts the first image File from a DragEvent or ClipboardEvent DataTransfer object.
 */
export function extractImageFileFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;

  if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f && f.type.startsWith('image/')) {
        return f;
      }
    }
  }

  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }

  return null;
}

/**
 * Extracts all image Files from a DragEvent or ClipboardEvent DataTransfer object (for multi-photo uploaders).
 */
export function extractAllImageFilesFromDataTransfer(dt: DataTransfer | null): File[] {
  const results: File[] = [];
  if (!dt) return results;

  if (dt.files && dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f && f.type.startsWith('image/')) {
        results.push(f);
      }
    }
    if (results.length > 0) return results;
  }

  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) results.push(f);
      }
    }
  }

  return results;
}

/**
 * Hook that enables Drag-and-Drop (`onDragOver`, `onDrop`) AND Copy-Paste (`onPaste` + optional window paste listener)
 * for any image upload area in the application.
 */
export function useImageDragDropAndPaste(
  onFileSelected: (file: File) => void,
  enableWindowPaste = false,
  disabled = false
): {
  isDraggingOver: boolean;
  zoneProps: {
    onDragEnter: (e: React.DragEvent<HTMLElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLElement>) => void;
    onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
    onDrop: (e: React.DragEvent<HTMLElement>) => void;
    onPaste: (e: React.ClipboardEvent<HTMLElement>) => void;
  };
} {
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    if (!enableWindowPaste || disabled || typeof window === 'undefined') return;

    const handleWindowPaste = (e: ClipboardEvent) => {
      const file = extractImageFileFromDataTransfer(e.clipboardData);
      if (file) {
        e.preventDefault();
        onFileSelected(file);
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => {
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, [enableWindowPaste, disabled, onFileSelected]);

  const onDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const onDrop = (e: React.DragEvent<HTMLElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = extractImageFileFromDataTransfer(e.dataTransfer);
    if (file) {
      onFileSelected(file);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLElement>) => {
    if (disabled) return;
    const file = extractImageFileFromDataTransfer(e.clipboardData);
    if (file) {
      e.preventDefault();
      e.stopPropagation();
      onFileSelected(file);
    }
  };

  return {
    isDraggingOver,
    zoneProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
      onPaste,
    },
  };
}
