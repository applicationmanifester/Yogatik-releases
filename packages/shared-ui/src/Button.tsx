import styled from 'styled-components';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

const ButtonBase = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
`;

export const Button = ({
  variant = 'primary',
  size = 'md',
  disabled,
  onClick,
  children,
}: ButtonProps) => {
  const variants = {
    primary: {
      backgroundColor: '#3b82f6',
      color: 'white',
      '&:hover:not(:disabled)': {
        backgroundColor: '#2563eb',
      },
    },
    secondary: {
      backgroundColor: '#e2e8f0',
      color: '#1e293b',
      '&:hover:not(:disabled)': {
        backgroundColor: '#cbd5e1',
      },
    },
    ghost: {
      background: 'transparent',
      color: '#3b82f6',
      border: '1px solid #3b82f6',
      '&:hover:not(:disabled)': {
        backgroundColor: '#f1f5f9',
      },
    },
  };

  const sizes = {
    sm: { padding: '0.5rem 1rem', fontSize: '0.75rem' },
    md: { padding: '0.75rem 1.5rem', fontSize: '0.875rem' },
    lg: { padding: '1rem 2rem', fontSize: '1rem' },
  };

  return (
    <ButtonBase
      {...variants[variant]}
      {...sizes[size]}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </ButtonBase>
  );
};