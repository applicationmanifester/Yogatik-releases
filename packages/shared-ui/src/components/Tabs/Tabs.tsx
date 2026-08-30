import {
  createContext,
  useContext,
  useState,
  useCallback,
  useId,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import styles from './Tabs.module.css';

export type TabsVariant = 'line' | 'enclosed' | 'soft';
export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabsContextValue {
  activeIndex: number;
  onTabClick: (index: number) => void;
  variant: TabsVariant;
  orientation: TabsOrientation;
  tabsId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('useTabs must be used within a Tabs component');
  }
  return context;
}

export const useTabsContext = useTabs;

export interface TabsProps {
  children: ReactNode;
  defaultIndex?: number;
  controlledIndex?: number;
  onChange?: (index: number) => void;
  variant?: TabsVariant;
  orientation?: TabsOrientation;
  className?: string;
  id?: string;
}

export function Tabs({
  children,
  defaultIndex = 0,
  controlledIndex,
  onChange,
  variant = 'line',
  orientation = 'horizontal',
  className = '',
  id: providedId,
}: TabsProps) {
  const generatedId = useId();
  const tabsId = providedId || `tabs-${generatedId.replace(/:/g, '')}`;
  const isControlled = controlledIndex !== undefined;
  const [uncontrolledIndex, setUncontrolledIndex] = useState(defaultIndex);
  const activeIndex = isControlled ? controlledIndex : uncontrolledIndex;

  const handleTabClick = useCallback(
    (index: number) => {
      if (!isControlled) {
        setUncontrolledIndex(index);
      }
      onChange?.(index);
    },
    [isControlled, onChange]
  );

  const contextValue: TabsContextValue = {
    activeIndex,
    onTabClick: handleTabClick,
    variant,
    orientation,
    tabsId,
  };

  return (
    <TabsContext.Provider value={contextValue}>
      <div
        className={`${styles.root} ${styles[variant]} ${styles[orientation]} ${className}`}
        data-orientation={orientation}
        role="tablist"
        aria-orientation={orientation}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function TabsList({ children, className = '', ...props }: TabsListProps) {
  return (
    <div className={`${styles.list} ${className}`} role="presentation" {...props}>
      {children}
    </div>
  );
}

export interface TabsTriggerProps {
  index: number;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function TabsTrigger({
  index,
  children,
  disabled = false,
  className = '',
  id: providedId,
}: TabsTriggerProps) {
  const { activeIndex, onTabClick, variant, orientation, tabsId } = useTabsContext();
  const isActive = activeIndex === index;
  const triggerId = providedId || `${tabsId}-trigger-${index}`;
  const panelId = `${tabsId}-panel-${index}`;

  const handleClick = () => {
    if (!disabled) {
      onTabClick(index);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    const tabs = Array.from(
      e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') || []
    );
    const currentPosition = tabs.findIndex((tab) => tab.id === triggerId);
    let newIndex: number | null = null;

    switch (e.key) {
      case orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown':
        e.preventDefault();
        newIndex = (currentPosition + 1) % tabs.length;
        break;
      case orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp':
        e.preventDefault();
        newIndex = (currentPosition - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
    }

    if (newIndex !== null) {
      const newTab = tabs[newIndex];
      newTab?.focus();
      onTabClick(newIndex);
    }
  };

  return (
    <button
      id={triggerId}
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={`${styles.trigger} ${styles[variant]} ${isActive ? styles.active : ''} ${disabled ? styles.disabled : ''} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-tabs-id={tabsId}
      type="button"
    >
      {children}
    </button>
  );
}

export interface TabsPanelProps {
  index: number;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function TabsPanel({ index, children, className = '', id: providedId }: TabsPanelProps) {
  const { activeIndex, tabsId, orientation } = useTabsContext();
  const isActive = activeIndex === index;
  const panelId = providedId || `${tabsId}-panel-${index}`;
  const triggerId = `${tabsId}-trigger-${index}`;

  if (!isActive) return null;

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={triggerId}
      tabIndex={0}
      className={`${styles.panel} ${className}`}
      data-orientation={orientation}
    >
      {children}
    </div>
  );
}

Tabs.displayName = 'Tabs';
TabsList.displayName = 'TabsList';
TabsTrigger.displayName = 'TabsTrigger';
TabsPanel.displayName = 'TabsPanel';