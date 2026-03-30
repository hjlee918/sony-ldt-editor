import { useState, useCallback } from 'react';

const MAX_HISTORY = 50;

/**
 * Custom hook for undo/redo history of channel data.
 *
 * @param {number[][]} initial - Initial 3-channel state
 * @returns {{ push, undo, redo, canUndo, canRedo }}
 */
export function useHistory(initial) {
  const [stack, setStack] = useState([initial.map(c => c.slice())]);
  const [idx, setIdx] = useState(0);

  const push = useCallback((channels) => {
    setStack(s => {
      const newStack = s.slice(0, idx + 1);
      newStack.push(channels.map(c => c.slice()));
      if (newStack.length > MAX_HISTORY) newStack.shift();
      return newStack;
    });
    setIdx(i => Math.min(i + 1, MAX_HISTORY));
  }, [idx]);

  const undo = useCallback(() => {
    if (idx > 0) {
      setIdx(i => i - 1);
      return stack[idx - 1].map(c => c.slice());
    }
    return null;
  }, [idx, stack]);

  const redo = useCallback(() => {
    if (idx < stack.length - 1) {
      setIdx(i => i + 1);
      return stack[idx + 1].map(c => c.slice());
    }
    return null;
  }, [idx, stack]);

  const canUndo = idx > 0;
  const canRedo = idx < stack.length - 1;

  return { push, undo, redo, canUndo, canRedo };
}
