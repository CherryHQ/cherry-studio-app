---
title: Atomic State Management
impact: HIGH
tags: state, jotai, zustand, re-renders, context
---

# Skill: Atomic State Management

Use atomic state libraries (Jotai, Zustand) to reduce unnecessary re-renders without manual memoization.

## Quick Pattern

**Before (broad Context value):**

```jsx
const { filter, todos } = useContext(TodoContext);
// Re-renders when the provider value identity changes
```

**After (Zustand - only subscribed state):**

```jsx
const filter = useTodoStore((s) => s.filter);
// Only re-renders when filter changes
```

## When to Use

- Global state changes cause widespread re-renders
- Using React Context for app state
- Components re-render even when their data hasn't changed
- Want to avoid manual `useMemo`/`useCallback` everywhere
- Not ready to adopt React Compiler

## Prerequisites

- State management library: `jotai` or `zustand`

```bash
npm install jotai
# or
npm install zustand
```

## Problem Description

Context is not inherently slow, but a broad provider value makes every consumer of that context eligible to re-render when the value identity changes. Atomic stores help when profiling shows unrelated subscribers rendering after global state updates.

## Step-by-Step Instructions

### Using Jotai

#### 1. Define Atoms

```jsx
import { atom } from 'jotai';

// Each atom is an independent piece of state
const filterAtom = atom('all');
const todosAtom = atom([]);

// Derived atom (computed value)
const filteredTodosAtom = atom((get) => {
  const filter = get(filterAtom);
  const todos = get(todosAtom);
  
  if (filter === 'active') return todos.filter(t => !t.completed);
  if (filter === 'completed') return todos.filter(t => t.completed);
  return todos;
});
```

#### 2. Use Atoms in Components

```jsx
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

// Only re-renders when filterAtom changes
const FilterMenu = () => {
  const [filter, setFilter] = useAtom(filterAtom);
  
  return (
    <View>
      {['all', 'active', 'completed'].map((f) => (
        <Pressable key={f} onPress={() => setFilter(f)}>
          <Text style={filter === f ? styles.active : null}>{f}</Text>
        </Pressable>
      ))}
    </View>
  );
};

// Only re-renders when todosAtom changes
const TodoItem = ({ id }) => {
  const setTodos = useSetAtom(todosAtom);  // Only setter, no re-render on read
  
  const toggleTodo = () => {
    setTodos((prev) => 
      prev.map((t) => t.id === id ? { ...t, completed: !t.completed } : t)
    );
  };
  
  return <Pressable onPress={toggleTodo}>...</Pressable>;
};
```

### Using Zustand

#### 1. Create Store

```jsx
import { create } from 'zustand';

const useTodoStore = create((set, get) => ({
  filter: 'all',
  todos: [],
  
  setFilter: (filter) => set({ filter }),
  
  toggleTodo: (id) => set((state) => ({
    todos: state.todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    ),
  })),
  
  // Selector for derived state
  getFilteredTodos: () => {
    const { filter, todos } = get();
    if (filter === 'active') return todos.filter(t => !t.completed);
    if (filter === 'completed') return todos.filter(t => t.completed);
    return todos;
  },
}));
```

#### 2. Use Selectors

```jsx
// Only re-renders when filter changes
const FilterMenu = () => {
  const filter = useTodoStore((state) => state.filter);
  const setFilter = useTodoStore((state) => state.setFilter);
  
  return (
    <View>
      {['all', 'active', 'completed'].map((f) => (
        <Pressable key={f} onPress={() => setFilter(f)}>
          <Text>{f}</Text>
        </Pressable>
      ))}
    </View>
  );
};

// Only re-renders when todos change
const TodoList = () => {
  const todos = useTodoStore((state) => state.todos);
  return todos.map((todo) => <TodoItem key={todo.id} {...todo} />);
};
```

## Comparison

| Feature | Context | Jotai | Zustand |
|---------|---------|-------|---------|
| Re-render scope | Consumers of changed provider value | Atom subscribers | Selector subscribers |
| Derived state | Manual | Built-in atoms | Selectors |
| DevTools | React DevTools | Jotai DevTools | Zustand DevTools |
| Bundle size | 0 KB | Small dependency | Small dependency |
| Learning curve | Low | Medium | Low |

## When to Use Which

Do not migrate global state solely for fewer re-renders if React Compiler or narrower subscriptions solve the measured issue. Atomic state helps when broad Context/store updates cause unrelated subscribers to render.

- **Jotai**: Fine-grained state, many small atoms, derived/async atoms
- **Zustand**: Simpler mental model, single store, familiar Redux-like pattern
- **React Compiler**: If available, may eliminate need for these libraries

## Common Pitfalls

- **Over-atomizing**: Don't create an atom for every variable. Group related state.
- **Missing selectors in Zustand**: Always use selectors to prevent unnecessary re-renders.
- **Derived state without memoization**: Use derived atoms (Jotai) or memoized selectors.

## Related Skills

- [js-bottomsheet.md](./js-bottomsheet.md) - Avoid context-driven bottom sheet subtree re-renders
- [js-react-compiler.md](./js-react-compiler.md) - Automatic memoization alternative
- [js-profile-react.md](./js-profile-react.md) - Verify re-render reduction
