import styled from 'styled-components';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SpinnerBase = styled.span`
  width: 1rem;
  height: 1rem;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
`;

export const Spinner = ({ size = 'md', className }: SpinnerProps) => {
  const sizes = {
    sm: { width: '0.75rem', height: '0.75rem' },
    md: { width: '1rem', height: '1rem' },
    lg: { width: '1.5rem', height: '1.5rem' },
  };

  return (
    <SpinnerBase
      {...sizes[size]}
      style={{ borderTopColor: '#3b82f6' }}
      className={className}
    />
  );
};