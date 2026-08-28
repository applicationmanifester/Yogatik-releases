import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Check, Skip } from 'lucide-react';

const tourStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(2px)',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  spotlight: {
    position: 'fixed',
    border: '3px solid var(--accent-color, #3b82f6)',
    borderRadius: '12px',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.4)',
    pointerEvents: 'auto',
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    zIndex: 10000,
  },
  tooltip: {
    position: 'fixed',
    background: 'var(--bg-elevated, #ffffff)',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '14px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    padding: '24px',
    width: '360px',
    maxWidth: 'calc(100vw - 32px)',
    zIndex: 10001,
    pointerEvents: 'auto',
    animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  tooltipArrow: {
    position: 'absolute',
    width: '16px',
    height: '16px',
    background: 'var(--bg-elevated, #ffffff)',
    borderLeft: '1px solid var(--border-color, #e5e7eb)',
    borderTop: '1px solid var(--border-color, #e5e7eb)',
    transform: 'rotate(45deg)',
    zIndex: -1,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  stepDot: (active) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: active ? 'var(--accent-color, #3b82f6)' : 'var(--border-color, #e5e7eb)',
    transition: 'all 0.2s',
  }),
  stepLine: {
    flex: 1,
    height: '2px',
    background: 'var(--border-color, #e5e7eb)',
    maxWidth: '60px',
  },
  stepLabel: {
    fontSize: '12px',
    color: 'var(--text-secondary, #6b7280)',
    fontWeight: 500,
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary, #111827)',
    marginBottom: '8px',
  },
  description: {
    fontSize: '14px',
    color: 'var(--text-secondary, #6b7280)',
    lineHeight: 1.6,
    marginBottom: '24px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '16px',
    borderTop: '1px solid var(--border-color, #e5e7eb)',
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.15s',
    border: 'none',
  },
  primaryButton: {
    background: 'var(--accent-color, #3b82f6)',
    color: 'white',
  },
  secondaryButton: {
    background: 'var(--bg-input, #ffffff)',
    color: 'var(--text-primary, #111827)',
    border: '1px solid var(--border-color, #e5e7eb)',
  },
  skipButton: {
    background: 'transparent',
    color: 'var(--text-muted, #9ca3af)',
    border: 'none',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: '8px',
    transition: 'all 0.15s',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: '3px',
    background: 'var(--accent-color, #3b82f6)',
    borderRadius: '0 0 14px 14px',
    transition: 'width 0.3s ease',
  },
  pulseRing: {
    position: 'absolute',
    inset: '-8px',
    border: '2px solid var(--accent-color, #3b82f6)',
    borderRadius: '16px',
    animation: 'pulse 2s ease-out infinite',
    pointerEvents: 'none',
  },
};

const defaultSteps = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to AI ChatBot! 👋',
    description: 'Let\'s take a quick tour to help you get the most out of your AI assistant.',
    position: 'center',
    action: null,
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    title: 'Conversation Sidebar',
    description: 'All your chats live here. Click to switch conversations, or use ⌘B to toggle this panel.',
    position: 'right',
    action: 'click',
  },
  {
    id: 'new-chat',
    target: '[data-tour="new-chat"]',
    title: 'Start a New Chat',
    description: 'Click here or press ⌘N anytime to begin a fresh conversation.',
    position: 'bottom',
    action: 'click',
  },
  {
    id: 'command-palette',
    target: '[data-tour="command-palette"]',
    title: 'Command Palette (⌘K)',
    description: 'Your universal search bar. Press ⌘K to find commands, search history, change settings, and more.',
    position: 'bottom',
    action: 'keyboard',
    keys: ['Meta', 'k'],
  },
  {
    id: 'message-input',
    target: '[data-tour="message-input"]',
    title: 'Message Composer',
    description: 'Type your message here. Press Enter to send, Shift+Enter for a new line.',
    position: 'top',
    action: 'focus',
  },
  {
    id: 'model-selector',
    target: '[data-tour="model-selector"]',
    title: 'Model Selector',
    description: 'Choose which AI model powers your conversation. Different models excel at different tasks.',
    position: 'left',
    action: 'click',
  },
  {
    id: 'settings',
    target: '[data-tour="settings"]',
    title: 'Settings (⌘,)',
    description: 'Customize your experience: themes, shortcuts, data export, API keys, and more.',
    position: 'left',
    action: 'click',
  },
  {
    id: 'shortcuts',
    target: '[data-tour="shortcuts"]',
    title: 'Keyboard Shortcuts (⌘/)',
    description: 'Press ⌘/ anytime to see all available shortcuts. Power users save hours this way!',
    position: 'left',
    action: 'keyboard',
    keys: ['Meta', '/'],
  },
  {
    id: 'complete',
    target: null,
    title: 'You\'re all set! 🎉',
    description: 'You now know the essentials. Start chatting, explore the command palette, and make this tool your own.',
    position: 'center',
    action: null,
  },
];

function OnboardingTour({ 
  isOpen, 
  onClose, 
  onComplete,
  steps = defaultSteps,
  storageKey = 'ai-chatbot-tour-completed',
  autoStart = false,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef(null);
  const spotlightRef = useRef(null);
  const previousFocus = useRef(null);
  const stepTimeouts = useRef([]);

  const isCompleted = () => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  };

  const markCompleted = () => {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {}
  };

  const getTargetElement = useCallback((step) => {
    if (!step.target) return null;
    return document.querySelector(step.target);
  }, []);

  const calculatePositions = useCallback((step) => {
    const target = getTargetElement(step);
    if (!target) {
      setTargetRect(null);
      setTooltipPosition({ 
        top: '50%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)' 
      });
      return;
    }

    const rect = target.getBoundingClientRect();
    setTargetRect(rect);

    const tooltipWidth = 360;
    const tooltipHeight = 280;
    const gap = 16;
    let top, left, arrowPos = {};

    switch (step.position) {
      case 'top':
        top = rect.top - tooltipHeight - gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        arrowPos = { bottom: '-8px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
        break;
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        arrowPos = { top: '-8px', left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - gap;
        arrowPos = { right: '-8px', top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + gap;
        arrowPos = { left: '-8px', top: '50%', transform: 'translateY(-50%) rotate(45deg)' };
        break;
      default:
        top = '50%';
        left = '50%';
        arrowPos = { display: 'none' };
    }

    // Clamp to viewport
    const padding = 16;
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));

    setTooltipPosition({ top: `${top}px`, left: `${left}px`, ...arrowPos });
  }, [getTargetElement]);

  const goToStep = useCallback((index) => {
    const clamped = Math.max(0, Math.min(index, steps.length - 1));
    setCurrentStep(clamped);
    stepTimeouts.current.forEach(clearTimeout);
    stepTimeouts.current = [];
    
    requestAnimationFrame(() => {
      calculatePositions(steps[clamped]);
    });
  }, [steps, calculatePositions]);

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      goToStep(currentStep + 1);
    } else {
      markCompleted();
      onComplete?.();
      onClose();
    }
  }, [currentStep, steps.length, goToStep, onComplete, onClose]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  }, [currentStep, goToStep]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      nextStep();
    } else if (e.key === 'ArrowLeft') {
      prevStep();
    }
  }, [nextStep, prevStep, onClose]);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement;
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      
      if (autoStart && !isCompleted()) {
        goToStep(0);
      }
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        stepTimeouts.current.forEach(clearTimeout);
        previousFocus.current?.focus();
      };
    }
  }, [isOpen, handleKeyDown, autoStart, goToStep]);

  useEffect(() => {
    if (isOpen) {
      calculatePositions(steps[currentStep]);
      window.addEventListener('resize', () => calculatePositions(steps[currentStep]));
      window.addEventListener('scroll', () => calculatePositions(steps[currentStep]), true);
      return () => {
        window.removeEventListener('resize', () => calculatePositions(steps[currentStep]));
        window.removeEventListener('scroll', () => calculatePositions(steps[currentStep]), true);
      };
    }
  }, [isOpen, currentStep, steps, calculatePositions]);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  if (!isOpen) return null;

  return createPortal(
    <>
      <div style={tourStyles.overlay} onClick={onClose} aria-hidden="true" />
      
      {targetRect && (
        <div 
          ref={spotlightRef}
          style={{
            ...tourStyles.spotlight,
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
          aria-hidden="true"
        >
          <div style={tourStyles.pulseRing} />
        </div>
      )}

      <div
        ref={tooltipRef}
        style={{
          ...tourStyles.tooltip,
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          transform: tooltipPosition.transform,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-desc"
      >
        <div style={tourStyles.progressBar} style={{ width: `${progress}%` }} />
        
        <div style={tourStyles.header}>
          <div style={tourStyles.stepIndicator}>
            {steps.map((_, i) => (
              <React.Fragment key={i}>
                <div style={tourStyles.stepDot(i === currentStep)} />
                {i < steps.length - 1 && <div style={tourStyles.stepLine} />}
              </React.Fragment>
            ))}
            <span style={tourStyles.stepLabel}>
              Step {currentStep + 1} of {steps.length}
            </span>
          </div>
          <button
            style={tourStyles.skipButton}
            onClick={() => { markCompleted(); onClose(); }}
          >
            Skip
          </button>
        </div>

        <h3 id="tour-title" style={tourStyles.title}>{step.title}</h3>
        <p id="tour-desc" style={tourStyles.description}>{step.description}</p>

        <div style={tourStyles.footer}>
          <div style={tourStyles.buttonGroup}>
            {currentStep > 0 && (
              <button
                style={{ ...tourStyles.button, ...tourStyles.secondaryButton }}
                onClick={prevStep}
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}
            <button
              style={{ ...tourStyles.button, ...tourStyles.primaryButton }}
              onClick={nextStep}
              autoFocus
            >
              {currentStep === steps.length - 1 ? (
                <>
                  <Check size={16} />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export { OnboardingTour, defaultSteps };
export default OnboardingTour;