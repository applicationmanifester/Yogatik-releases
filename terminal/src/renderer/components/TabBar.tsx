import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { TabState } from '@shared/types';

interface TabBarProps {
  tabs: TabState[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  onTabRename: (tabId: string, title: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  onTabReorder,
  onTabRename,
}: TabBarProps) {
  const [dragState, setDragState] = useState<{ tabId: string; index: number } | null>(null);
  const [showTabMenu, setShowTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [renameState, setRenameState] = useState<{ tabId: string; value: string } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

  // Focus rename input
  useEffect(() => {
    if (renameState && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renameState]);

  // Click outside to close menus
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!e.target || !(e.target as Element).closest('.tab-menu')) {
        setShowTabMenu(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleDragStart = (e: React.DragEvent, tabId: string, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
    setDragState({ tabId, index });
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (dragState && dragState.index !== index) {
      onTabReorder(dragState.index, index);
      setDragState({ ...dragState, index });
    }
  };

  const handleDragEnd = () => {
    setDragState(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragState(null);
  };

  const handleTabClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 0 && !dragState) {
      onTabClick(tabId);
    }
  };

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setShowTabMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  };

  const startRename = (tabId: string, currentTitle: string) => {
    setShowTabMenu(null);
    setRenameState({ tabId, value: currentTitle });
  };

  const handleRenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRenameState(prev => prev ? { ...prev, value: e.target.value } : null);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameState) {
      onTabRename(renameState.tabId, renameState.value || 'Terminal');
      setRenameState(null);
    }
  };

  const handleRenameBlur = () => {
    if (renameState) {
      onTabRename(renameState.tabId, renameState.value || 'Terminal');
      setRenameState(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(e as any);
    } else if (e.key === 'Escape') {
      setRenameState(null);
    }
  };

  return (
    <div className="tab-bar" role="tablist">
      <div className="tab-bar-left">
        <div
          ref={scrollRef}
          className="tab-scroll-container"
          onScroll={(e) => tabsContainerRef.current?.scrollTo({ left: (e.target as HTMLDivElement).scrollLeft })}
        >
          <div
            ref={tabsContainerRef}
            className="tabs-container"
            role="tablist"
            aria-label="Terminal tabs"
          >
            {sortedTabs.map((tab, index) => {
              const isActive = tab.id === activeTabId;
              const isDragging = dragState?.tabId === tab.id;
              
              return (
                <div
                  key={tab.id}
                  className={`tab ${isActive ? 'active' : ''} ${tab.isModified ? 'modified' : ''} ${isDragging ? 'dragging' : ''}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tab.userTitle || tab.title}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, tab.id, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  onClick={(e) => handleTabClick(e, tab.id)}
                  onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!renameState) {
                      startRename(tab.id, tab.userTitle || tab.title);
                    }
                  }}
                >
                  <span className="tab-icon" aria-hidden="true">▶</span>
                  
                  {renameState?.tabId === tab.id ? (
                    <form onSubmit={handleRenameSubmit} className="tab-rename-form">
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameState.value}
                        onChange={handleRenameChange}
                        onBlur={handleRenameBlur}
                        onKeyDown={(e) => handleKeyDown(e, tab.id)}
                        className="tab-rename-input"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </form>
                  ) : (
                    <span className="tab-title" title={tab.userTitle || tab.title}>
                      {tab.userTitle || tab.title}
                    </span>
                  )}
                  
                  {tab.badge && <span className="tab-badge">{tab.badge}</span>}
                  
                  <button
                    className="tab-close"
                    onClick={(e) => handleCloseClick(e, tab.id)}
                    aria-label="Close tab"
                    tabIndex={-1}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="tab-bar-right">
        <button
          className="tab-new-button"
          onClick={onNewTab}
          aria-label="New tab (Ctrl+Shift+T)"
          title="New tab (Ctrl+Shift+T)"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Tab Context Menu */}
      {showTabMenu && (
        <div
          className="tab-menu"
          style={{ left: showTabMenu.x, top: showTabMenu.y }}
          role="menu"
        >
          <div className="menu-item" role="menuitem" onClick={() => {
            startRename(showTabMenu.tabId, tabs.find(t => t.id === showTabMenu.tabId)?.userTitle || tabs.find(t => t.id === showTabMenu.tabId)?.title || 'Terminal');
          }}>
            Rename
          </div>
          <div className="menu-item" role="menuitem" onClick={() => {
            onTabClose(showTabMenu.tabId);
          }}>
            Close
          </div>
          <div className="menu-separator" />
          <div className="menu-item" role="menuitem" onClick={() => {
            onNewTab();
          }}>
            New Tab
          </div>
          <div className="menu-item" role="menuitem" onClick={() => {
            // Split horizontal
          }}>
            Split Horizontal
          </div>
          <div className="menu-item" role="menuitem" onClick={() => {
            // Split vertical
          }}>
            Split Vertical
          </div>
        </div>
      )}
    </div>
  );
}